import type { RoleName } from '@/lib/utils/roles';
import { isRoleName } from '@/lib/utils/roles';

export type AuthSessionUser = {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  position: string;
  hourlyRate: number | null;
};

/** Columns required to decide whether a signed JWT still belongs to a staff user. */
export type StaffAuthRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  position: string;
  hourlyRate: number | null;
  passwordHash: string | null;
  /** Password generation. Missing legacy JWTs compare as 0. */
  credentialVersion: number;
};

export type StaffLookup =
  | { ok: true; row: StaffAuthRow | null }
  | { ok: false };

export type StaffResolution =
  | { status: 'active'; user: AuthSessionUser }
  | { status: 'revoked' }
  | { status: 'lookup_failed' };

function hourlyRateOrNull(rate: number | null): number | null {
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * Map a staff row onto the session user authorization uses.
 * A missing row, a cleared password, or an unknown role is revoked.
 * Unknown roles are not downgraded to FLOOR_STAFF.
 */
export function staffUserFromRow(row: StaffAuthRow | null): AuthSessionUser | null {
  if (!row) return null;
  if (!row.passwordHash) return null;
  if (!row.id || !row.email) return null;
  if (!isRoleName(row.role)) return null;
  return {
    id: row.id,
    name: row.name ?? '',
    email: row.email,
    role: row.role,
    position: row.position ?? '',
    hourlyRate: hourlyRateOrNull(row.hourlyRate),
  };
}

/** Pure result of a staff lookup. Lookup errors never fall back to a token role. */
export function resolveStaffLookup(lookup: StaffLookup): StaffResolution {
  if (!lookup.ok) return { status: 'lookup_failed' };
  const user = staffUserFromRow(lookup.row);
  if (!user) return { status: 'revoked' };
  return { status: 'active', user };
}

/** Claims copied onto the JWT/session. `lookupFailed` must not authorize. */
/**
 * Legacy JWTs omit the claim and stay valid while the row is still version 0.
 * A password change increments the row. Deletion is a missing row, not an increment.
 */
export function credentialVersionMatches(
  tokenVersion: number | null | undefined,
  rowVersion: number
): boolean {
  const token =
    typeof tokenVersion === 'number' && Number.isFinite(tokenVersion) && tokenVersion >= 0
      ? tokenVersion
      : 0;
  return token === rowVersion;
}

export function sessionClaimsFromLookup(lookup: StaffLookup): {
  user: AuthSessionUser | null;
  lookupFailed: boolean;
  credentialVersion: number | null;
} {
  const resolved = resolveStaffLookup(lookup);
  if (resolved.status === 'lookup_failed') {
    return { user: null, lookupFailed: true, credentialVersion: null };
  }
  if (resolved.status === 'active' && lookup.ok && lookup.row) {
    return {
      user: resolved.user,
      lookupFailed: false,
      credentialVersion: lookup.row.credentialVersion,
    };
  }
  return { user: null, lookupFailed: false, credentialVersion: null };
}

export function isActiveRole(role: string | null | undefined): role is RoleName {
  return typeof role === 'string' && isRoleName(role);
}
