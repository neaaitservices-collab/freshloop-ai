import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  DepartmentAdminError,
  DEPARTMENT_CODE_TAKEN,
  type DepartmentAdminDb,
} from '@/lib/domains/catalog/departmentAdmin';
import type { DepartmentRefRecord } from '@/lib/domains/catalog/departmentRef';
import {
  departmentRefTableReady,
  invalidateDepartmentRefCaches,
} from '@/lib/domains/catalog/departmentRefStore';

function toRecord(row: {
  id: string;
  code: string;
  name: string;
  active: boolean;
  sortOrder: number;
}): DepartmentRefRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active,
    sortOrder: row.sortOrder,
  };
}

export const departmentAdminDb: DepartmentAdminDb = {
  ready: () => departmentRefTableReady(),
  async list() {
    const rows = await prisma.departmentRef.findMany({
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return rows.map(toRecord);
  },
  async insert(row) {
    try {
      const saved = await prisma.departmentRef.create({
        data: {
          code: row.code,
          name: row.name,
          active: row.active,
          sortOrder: row.sortOrder,
        },
      });
      invalidateDepartmentRefCaches();
      return toRecord(saved);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DepartmentAdminError(DEPARTMENT_CODE_TAKEN, 409);
      }
      throw error;
    }
  },
  async update(id, data) {
    try {
      const saved = await prisma.departmentRef.update({
        where: { id },
        data,
      });
      invalidateDepartmentRefCaches();
      return toRecord(saved);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return null;
      }
      throw error;
    }
  },
};

export async function loadAdminDepartments(): Promise<{
  ready: boolean;
  departments: DepartmentRefRecord[];
}> {
  if (!(await departmentAdminDb.ready())) return { ready: false, departments: [] };
  return { ready: true, departments: await departmentAdminDb.list() };
}
