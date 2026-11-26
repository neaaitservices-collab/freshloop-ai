import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';
import { positionByLabel, positionForRole } from '@/lib/utils/positions';
import { isManager, isRoleName, roleAtOrAbove, type RoleName } from '@/lib/utils/roles';

export class StaffAccountError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404
  ) {
    super(message);
    this.name = 'StaffAccountError';
  }
}

/** Staff row the account commands are allowed to read and update. No ledger handle. */
export type StaffRecord = {
  id: string;
  name: string;
  email: string;
  position: string;
  role: RoleName;
  credentialVersion: number;
  deactivatedAt: Date | null;
};

export type StaffAccountUpdate = {
  name?: string;
  email?: string;
  position?: string;
  role?: RoleName;
  /** Undefined leaves the column alone. Null reactivates. */
  deactivatedAt?: Date | null;
  credentialVersionIncrement?: boolean;
};

export type StaffAccountDb = {
  findById(id: string): Promise<StaffRecord | null>;
  /** Active owners other than `exceptId`. Deactivated owners do not count. */
  countActiveOwners(exceptId: string): Promise<number>;
  passwordHashFor(id: string): Promise<string | null>;
  update(id: string, data: StaffAccountUpdate): Promise<StaffRecord>;
  /**
   * Locks every active owner row in id order, then runs `fn` on that same
   * transaction. The second caller waits until the first commits.
   */
  withActiveOwnerLock<T>(fn: (db: StaffAccountDb) => Promise<T>): Promise<T>;
};

const OWNER_ONLY = 'Only an owner can change a role.';
const SELF_DEMOTION = 'You cannot remove your own owner role.';
const SELF_DEACTIVATE = 'You cannot deactivate your own account.';
const LAST_OWNER = 'Keep at least one owner.';
const GONE = 'That person is already gone.';
const ROLE_CEILING = 'You cannot edit someone at or above your role.';
const POSITION_ROLE_MISMATCH = 'Position and role do not match.';

function assertOwner(actor: AuthSessionUser): void {
  if (actor.role !== 'ADMIN') {
    throw new StaffAccountError(OWNER_ONLY, 403);
  }
}

async function assertNotLastActiveOwner(db: StaffAccountDb, target: StaffRecord): Promise<void> {
  if (target.role !== 'ADMIN' || target.deactivatedAt) return;
  const others = await db.countActiveOwners(target.id);
  if (others === 0) {
    throw new StaffAccountError(LAST_OWNER, 400);
  }
}

/** A non-owner cannot change any field of a person at their rank or higher. Self-edits stay allowed. */
export function assertMayEditStaff(actor: AuthSessionUser, target: StaffRecord): void {
  if (actor.id === target.id) return;
  if (actor.role === 'ADMIN') return;
  if (!isManager(actor.role) || roleAtOrAbove(actor.role, target.role)) {
    throw new StaffAccountError(ROLE_CEILING, 403);
  }
}

export async function saveStaffProfile(
  db: StaffAccountDb,
  actor: AuthSessionUser,
  targetId: string,
  input: {
    name: string;
    email: string;
    position?: string;
    role?: RoleName;
  }
): Promise<StaffRecord> {
  return db.withActiveOwnerLock((locked) => saveStaffProfileLocked(locked, actor, targetId, input));
}

async function saveStaffProfileLocked(
  db: StaffAccountDb,
  actor: AuthSessionUser,
  targetId: string,
  input: {
    name: string;
    email: string;
    position?: string;
    role?: RoleName;
  }
): Promise<StaffRecord> {
  const current = await db.findById(targetId);
  if (!current || !isRoleName(current.role)) {
    throw new StaffAccountError(GONE, 404);
  }

  const isSelf = actor.id === current.id;
  assertMayEditStaff(actor, current);
  if (!isSelf && !isManager(actor.role)) {
    throw new StaffAccountError('Forbidden — managers only.', 403);
  }

  // An explicit role is the only role source. A position cannot override it.
  let role = current.role;
  if (input.role) {
    role = input.role;
  } else if (input.position) {
    const assigned = positionByLabel(input.position);
    if (assigned) role = assigned.role;
  }

  if (input.role && input.position?.trim()) {
    const assigned = positionByLabel(input.position);
    if (assigned && assigned.role !== input.role) {
      throw new StaffAccountError(POSITION_ROLE_MISMATCH, 400);
    }
  }

  const email = input.email.trim().toLowerCase();
  const emailChanged = email !== current.email;
  let position = current.position;
  if (role !== current.role) {
    assertOwner(actor);
    if (isSelf && current.role === 'ADMIN') {
      throw new StaffAccountError(SELF_DEMOTION, 400);
    }
    await assertNotLastActiveOwner(db, current);
    position = positionForRole(role).label;
  } else if (input.position && input.position.trim()) {
    if (!isManager(actor.role)) {
      throw new StaffAccountError('Only a manager can change a position.', 403);
    }
    const assigned = positionByLabel(input.position);
    if (!assigned) {
      throw new StaffAccountError('Choose a position. Permissions follow that position.', 400);
    }
    if (input.role && assigned.role !== role) {
      throw new StaffAccountError(POSITION_ROLE_MISMATCH, 400);
    }
    if (!input.role && assigned.role !== current.role) {
      throw new StaffAccountError(POSITION_ROLE_MISMATCH, 400);
    }
    position = assigned.label;
  }

  return db.update(current.id, {
    name: input.name.trim(),
    email,
    position,
    role,
    credentialVersionIncrement: emailChanged,
  });
}

export async function deactivateStaff(
  db: StaffAccountDb,
  actor: AuthSessionUser,
  targetId: string,
  deactivatedAt: Date = new Date()
): Promise<StaffRecord> {
  assertOwner(actor);
  return db.withActiveOwnerLock(async (locked) => {
    const current = await locked.findById(targetId);
    if (!current) throw new StaffAccountError(GONE, 404);
    if (current.deactivatedAt) return current;
    if (actor.id === current.id) {
      throw new StaffAccountError(SELF_DEACTIVATE, 400);
    }
    await assertNotLastActiveOwner(locked, current);
    return locked.update(current.id, {
      deactivatedAt,
      credentialVersionIncrement: true,
    });
  });
}

export async function reactivateStaff(
  db: StaffAccountDb,
  actor: AuthSessionUser,
  targetId: string
): Promise<StaffRecord> {
  assertOwner(actor);
  return db.withActiveOwnerLock(async (locked) => {
    const current = await locked.findById(targetId);
    if (!current) throw new StaffAccountError(GONE, 404);
    if (!current.deactivatedAt) return current;
    return locked.update(current.id, { deactivatedAt: null });
  });
}
