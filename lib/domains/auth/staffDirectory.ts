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

async function loadStaffDirectory(): Promise<StaffUser[]> {
  const users = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      position: true,
      role: true,
      hourlyRate: true,
    },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    position: u.position,
    role: u.role as StaffUser['role'],
    hourlyRate: normalizeHourlyRate(u.hourlyRate),
  }));
}

/** Manager staff roster (single Prisma round-trip, short TTL). */
export function getStaffDirectory(): Promise<StaffUser[]> {
  return rememberLedgerRead(
    staffDirectoryCache,
    'staff-directory',
    STAFF_DIRECTORY_MS,
    loadStaffDirectory
  );
}
