import { auth } from '@/auth';
import { loadStaffAuthRow } from '@/lib/auth/loadStaffAuth';
import {
  credentialVersionMatches,
  resolveStaffLookup,
  type AuthSessionUser,
  type StaffAuthRow,
} from '@/lib/auth/staffSnapshot';
import type { RoleName } from '@/lib/utils/roles';

export type { AuthSessionUser };

type SessionLike = {
  user?: { id?: string | null; credentialVersion?: number | null } | null;
  staffLookupFailed?: boolean;
} | null;

export type SessionDeps = {
  readSession?: () => Promise<SessionLike>;
  loadStaff?: (userId: string) => Promise<StaffAuthRow | null>;
};

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

async function readAuthSession(): Promise<SessionLike> {
  return auth();
}

/**
 * Authorization identity for server handlers and the page gate.
 * The signed JWT supplies the user id only. Role and account status come from `staff_users`.
 * A deleted user, a user with no password, an unknown role, or a failed lookup does not authorize.
 */
export async function getSessionUser(deps?: SessionDeps): Promise<AuthSessionUser | null> {
  const readSession = deps?.readSession ?? readAuthSession;
  const loadStaff = deps?.loadStaff ?? loadStaffAuthRow;
  const session = await readSession();
  if (session?.staffLookupFailed) {
    throw new AuthError('Unauthorized — session could not be verified.', 401);
  }
  const userId = session?.user?.id;
  if (!userId) return null;

  let row: StaffAuthRow | null;
  try {
    row = await loadStaff(userId);
  } catch {
    throw new AuthError('Unauthorized — session could not be verified.', 401);
  }

  if (row && !credentialVersionMatches(session.user?.credentialVersion, row.credentialVersion)) {
    return null;
  }

  const resolved = resolveStaffLookup({ ok: true, row });
  if (resolved.status !== 'active') return null;
  return resolved.user;
}

export async function requireSessionUser(deps?: SessionDeps): Promise<AuthSessionUser> {
  const user = await getSessionUser(deps);
  if (!user) {
    throw new AuthError('Unauthorized — sign in required.', 401);
  }
  return user;
}

export async function requireRoles(
  allowed: RoleName[],
  deps?: SessionDeps
): Promise<AuthSessionUser> {
  const user = await requireSessionUser(deps);
  if (!allowed.includes(user.role)) {
    throw new AuthError('Forbidden — your role cannot perform this action.', 403);
  }
  return user;
}
