import { prisma } from '@/lib/domains/inventory/ledger';
import { rememberLedgerRead } from '@/lib/domains/inventory/ledgerCache';
import type { StaffUser } from '@/lib/utils/roles';

const STAFF_DIRECTORY_MS = 30_000;
const staffDirectoryCache = new Map<
  string,
  { at: number; gen: number; value: Promise<StaffUser[]> }
>();

function normalizeHourlyRate(hourlyRate: number | null | undefined): number | null {
  return hourlyRate != null && Number.isFinite(hourlyRate) && hourlyRate > 0
    ? Number(hourlyRate.toFixed(2))
    : null;
}

/** Active roster omits deactivated staff. `includeInactive` is the Show inactive list. */
export function activeStaffDirectoryWhere(includeInactive: boolean): { deactivatedAt: null } | undefined {
  if (includeInactive) return undefined;
  return { deactivatedAt: null };
}

async function loadStaffDirectory(includeInactive: boolean): Promise<StaffUser[]> {
  const users = await prisma.user.findMany({
    where: activeStaffDirectoryWhere(includeInactive),
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      position: true,
      role: true,
      hourlyRate: true,
      deactivatedAt: true,
    },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    position: u.position,
    role: u.role as StaffUser['role'],
    hourlyRate: normalizeHourlyRate(u.hourlyRate),
    deactivatedAt: u.deactivatedAt ? u.deactivatedAt.toISOString() : null,
  }));
}

/** Manager staff roster (single Prisma round-trip, short TTL). */
export function getStaffDirectory(includeInactive = false): Promise<StaffUser[]> {
  return rememberLedgerRead(
    staffDirectoryCache,
    includeInactive ? 'staff-directory-all' : 'staff-directory',
    STAFF_DIRECTORY_MS,
    () => loadStaffDirectory(includeInactive)
  );
}
