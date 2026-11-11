import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  resolveDepartmentCatalog,
  type DepartmentCatalog,
  type DepartmentRefRecord,
} from '@/lib/domains/catalog/departmentRef';

type DepartmentDb = PrismaClient | Prisma.TransactionClient;

const READY_TTL_MS = 60_000;
const MISS_TTL_MS = 5_000;
const CODE_MAP_TTL_MS = 60_000;

let readyCache: { at: number; ready: boolean } | null = null;
let codeMapCache: { at: number; map: Map<string, string> } | null = null;

function asBool(value: unknown): boolean {
  return value === true || value === 't' || value === 'true';
}

/** True only when the table and every nullable department_id column exist. */
export async function departmentRefTableReady(): Promise<boolean> {
  const now = Date.now();
  if (readyCache && now - readyCache.at < (readyCache.ready ? READY_TTL_MS : MISS_TTL_MS)) {
    return readyCache.ready;
  }
  try {
    const rows = await prisma.$queryRaw<Array<{ ready: boolean }>>`
      SELECT (
        EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = 'department_refs'
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'products'
            AND column_name = 'department_id'
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'invoice_line_items'
            AND column_name = 'department_id'
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'inventory_items'
            AND column_name = 'department_id'
        )
      ) AS ready
    `;
    const ready = asBool(rows[0]?.ready);
    readyCache = { at: now, ready };
    return ready;
  } catch {
    readyCache = { at: now, ready: false };
    return false;
  }
}

export interface DepartmentRefState {
  ready: boolean;
  rows: DepartmentRefRecord[];
}

export async function loadDepartmentRefState(): Promise<DepartmentRefState> {
  if (!(await departmentRefTableReady())) return { ready: false, rows: [] };
  try {
    const rows = await prisma.departmentRef.findMany({
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return {
      ready: true,
      rows: rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        active: row.active,
        sortOrder: row.sortOrder,
      })),
    };
  } catch {
    return { ready: false, rows: [] };
  }
}

/** Receive picker, catalogue filter, and any other department list. */
export async function loadDepartmentCatalog(): Promise<DepartmentCatalog> {
  const state = await loadDepartmentRefState();
  return resolveDepartmentCatalog({
    rows: state.rows,
    unavailable: !state.ready,
  });
}

/**
 * Code → id for dual-writes. Null means the table could not be read, so callers
 * omit departmentId and still write the enum column.
 */
export async function loadDepartmentCodeMap(db?: DepartmentDb): Promise<Map<string, string> | null> {
  const now = Date.now();
  if (codeMapCache && now - codeMapCache.at < CODE_MAP_TTL_MS) return codeMapCache.map;
  if (!(await departmentRefTableReady())) return null;
  try {
    const rows = await (db ?? prisma).departmentRef.findMany({
      select: { id: true, code: true },
    });
    const map = new Map(rows.map((row) => [row.code, row.id]));
    if (map.size > 0) codeMapCache = { at: now, map };
    return map;
  } catch {
    return null;
  }
}
