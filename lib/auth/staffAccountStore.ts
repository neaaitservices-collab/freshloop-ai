import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { StaffAccountDb, StaffAccountUpdate, StaffRecord } from '@/lib/auth/staffAccount';
import { isRoleName } from '@/lib/utils/roles';

const staffSelect = {
  id: true,
  name: true,
  email: true,
  position: true,
  role: true,
  credentialVersion: true,
  deactivatedAt: true,
} as const;

type StaffRow = {
  id: string;
  name: string;
  email: string;
  position: string;
  role: string;
  credentialVersion: number;
  deactivatedAt: Date | null;
};

type DbClient = Prisma.TransactionClient | PrismaClient;

function toRecord(row: StaffRow): StaffRecord | null {
  if (!isRoleName(row.role)) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    position: row.position,
    role: row.role,
    credentialVersion: row.credentialVersion,
    deactivatedAt: row.deactivatedAt,
  };
}

function dbFrom(client: DbClient, alreadyLocked: boolean): StaffAccountDb {
  const db: StaffAccountDb = {
    async findById(id) {
      const row = await client.user.findUnique({ where: { id }, select: staffSelect });
      return row ? toRecord(row) : null;
    },
    async countActiveOwners(exceptId) {
      return client.user.count({
        where: {
          role: 'ADMIN',
          deactivatedAt: null,
          id: { not: exceptId },
        },
      });
    },
    async passwordHashFor(id) {
      const row = await client.user.findUnique({
        where: { id },
        select: { passwordHash: true },
      });
      return row?.passwordHash ?? null;
    },
    async update(id, data: StaffAccountUpdate) {
      const row = await client.user.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.position !== undefined ? { position: data.position } : {}),
          ...(data.role !== undefined ? { role: data.role } : {}),
          ...(data.deactivatedAt !== undefined ? { deactivatedAt: data.deactivatedAt } : {}),
          ...(data.credentialVersionIncrement ? { credentialVersion: { increment: 1 } } : {}),
        },
        select: staffSelect,
      });
      const record = toRecord(row);
      if (!record) {
        throw new Error('Staff role is no longer recognized.');
      }
      return record;
    },
    async withActiveOwnerLock(fn) {
      if (alreadyLocked) return fn(db);
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "staff_users"
          WHERE "role" = 'ADMIN'::"Role"
            AND "deactivated_at" IS NULL
          ORDER BY "id"
          FOR UPDATE
        `;
        return fn(dbFrom(tx, true));
      });
    },
  };
  return db;
}

export const staffAccountDb: StaffAccountDb = dbFrom(prisma, false);

type StaffDbGlobal = { __freshloopStaffAccountDb?: StaffAccountDb | null };

/** Test-only db. Production always uses Prisma. */
export function setStaffAccountDbForTests(db: StaffAccountDb | null) {
  if (process.env.NODE_ENV === 'production') return;
  (globalThis as StaffDbGlobal).__freshloopStaffAccountDb = db;
}

export function getStaffAccountDb(): StaffAccountDb {
  if (process.env.NODE_ENV !== 'production') {
    const hooked = (globalThis as StaffDbGlobal).__freshloopStaffAccountDb;
    if (hooked) return hooked;
  }
  return staffAccountDb;
}
