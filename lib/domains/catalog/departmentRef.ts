import type { Department } from '@prisma/client';
import { DEPARTMENT_LABELS } from '@/lib/domains/inventory/inventoryCatalog';

/**
 * Department list moved onto `department_refs` while the Department enum stays.
 * Migration: prisma/migrations/20261111120000_department_ref/migration.sql
 * Re-runnable data step: scripts/backfill-department-refs.sql
 * Both files must contain departmentRefSeedSql() and departmentBackfillSql() verbatim.
 * Do not run either against a shared, preview, or production database without Nelson's approval.
 */
export const DEPARTMENT_REF_MIGRATION =
  'prisma/migrations/20261111120000_department_ref/migration.sql';
export const DEPARTMENT_REF_BACKFILL_SCRIPT = 'scripts/backfill-department-refs.sql';

/** Fixed ids so the migration insert is stable. `code` is the permanent key. */
export const DEPARTMENT_REF_IDS = {
  PRODUCE: 'd1000000-0000-4000-8000-000000000001',
  DAIRY: 'd1000000-0000-4000-8000-000000000002',
  BAKERY: 'd1000000-0000-4000-8000-000000000003',
  PANTRY: 'd1000000-0000-4000-8000-000000000004',
  DELI_KITCHEN: 'd1000000-0000-4000-8000-000000000005',
  GROCERY: 'd1000000-0000-4000-8000-000000000006',
} as const satisfies Record<Department, string>;

export interface DepartmentRefRecord {
  id: string;
  code: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

export interface DepartmentRefSeedRow extends DepartmentRefRecord {
  code: Department;
}

export interface DepartmentOption {
  code: string;
  name: string;
  sortOrder: number;
}

export interface DepartmentCatalog {
  source: 'table' | 'enum';
  departments: DepartmentOption[];
}

export interface ResolvedDepartment {
  code: string;
  name: string;
  source: 'table' | 'enum';
}

export interface DepartmentBackfillRow {
  departmentId: string | null;
  enumCode: string;
}

export interface DepartmentBackfillUpdate {
  enumCode: string;
  departmentId: string;
}

/** One row per current Department enum value. Names match the catalogue labels. */
export const DEPARTMENT_REF_SEED: DepartmentRefSeedRow[] = (
  Object.keys(DEPARTMENT_LABELS) as Department[]
).map((code, index) => ({
  id: DEPARTMENT_REF_IDS[code],
  code,
  name: DEPARTMENT_LABELS[code],
  active: true,
  sortOrder: (index + 1) * 10,
}));

export const DEPARTMENT_BACKFILL_TABLES = ['products', 'invoice_line_items', 'inventory_items'] as const;

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Idempotent seed. Existing codes are left alone, including their ids. */
export function departmentRefSeedSql(): string {
  const values = DEPARTMENT_REF_SEED.map(
    (row) =>
      `  (${sqlLiteral(row.id)}, ${sqlLiteral(row.code)}, ${sqlLiteral(row.name)}, true, ${row.sortOrder})`
  ).join(',\n');
  return [
    'INSERT INTO "department_refs" ("id", "code", "name", "active", "sort_order")',
    'VALUES',
    values,
    'ON CONFLICT ("code") DO NOTHING;',
  ].join('\n');
}

/** Idempotent backfill. Rows that already have department_id are not touched. */
export function departmentBackfillSql(): string {
  return DEPARTMENT_BACKFILL_TABLES.map(
    (table) =>
      [
        `UPDATE "${table}" AS item`,
        'SET "department_id" = ref."id"',
        'FROM "department_refs" AS ref',
        'WHERE item."department_id" IS NULL',
        '  AND ref."code" = item."department"::text;',
      ].join('\n')
  ).join('\n\n');
}

export function enumDepartmentOptions(): DepartmentOption[] {
  return DEPARTMENT_REF_SEED.map((row) => ({
    code: row.code,
    name: row.name,
    sortOrder: row.sortOrder,
  }));
}

/**
 * Picker and filter options. An empty table, a table with no active rows, or a
 * failed read uses the enum labels.
 */
export function resolveDepartmentCatalog(input: {
  rows?: readonly DepartmentRefRecord[] | null;
  unavailable?: boolean;
}): DepartmentCatalog {
  if (input.unavailable || !input.rows) {
    return { source: 'enum', departments: enumDepartmentOptions() };
  }
  const active = input.rows.filter((row) => row.active && row.code.trim());
  if (active.length === 0) {
    return { source: 'enum', departments: enumDepartmentOptions() };
  }
  const departments = active
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((row) => ({
      code: row.code,
      name: row.name,
      sortOrder: row.sortOrder,
    }));
  return { source: 'table', departments };
}

/**
 * Catalogue stock row. The enum column is cast to text in SQL. A driver value that
 * is not text still becomes a string here, so callers can trim it.
 * departmentId wins when the ref row is present.
 */
export function stockRowDepartmentCode(input: {
  department: unknown;
  departmentId?: string | null;
  rows?: readonly DepartmentRefRecord[] | null;
  unavailable?: boolean;
}): string {
  const refsById = new Map(
    (input.unavailable ? [] : (input.rows ?? [])).map((row) => [row.id, row])
  );
  return resolveItemDepartment({
    departmentId: input.departmentId,
    enumCode: typeof input.department === 'string' ? input.department : '',
    refsById,
    unavailable: Boolean(input.unavailable),
  }).code;
}

/** Item read. departmentId wins when the ref row is present; otherwise the enum column. */
export function resolveItemDepartment(input: {
  departmentId?: string | null;
  enumCode: string;
  refsById: ReadonlyMap<string, Pick<DepartmentRefRecord, 'code' | 'name'>>;
  unavailable?: boolean;
}): ResolvedDepartment {
  if (!input.unavailable && input.departmentId) {
    const ref = input.refsById.get(input.departmentId);
    if (ref?.code) {
      return { code: ref.code, name: ref.name, source: 'table' };
    }
  }
  const known = DEPARTMENT_LABELS[input.enumCode as Department];
  return {
    code: input.enumCode,
    name: known ?? input.enumCode.replace(/_/g, ' '),
    source: 'enum',
  };
}

/**
 * Dual-write fields. A null map means the table is unavailable, so departmentId
 * is omitted and the enum column is still written. An empty map sets departmentId null.
 */
export function departmentIdColumns(
  code: string,
  codeToId: ReadonlyMap<string, string> | null
): { departmentId?: string | null } {
  if (codeToId === null) return {};
  return { departmentId: codeToId.get(code) ?? null };
}

/** Fill department_id from the enum code. Already-filled rows and unknown codes are skipped. */
export function planDepartmentIdBackfill(
  rows: readonly DepartmentBackfillRow[],
  codeToId: ReadonlyMap<string, string>
): DepartmentBackfillUpdate[] {
  const updates: DepartmentBackfillUpdate[] = [];
  for (const row of rows) {
    if (row.departmentId) continue;
    const departmentId = codeToId.get(row.enumCode);
    if (!departmentId) continue;
    updates.push({ enumCode: row.enumCode, departmentId });
  }
  return updates;
}

/** Apply a backfill plan in memory. A second pass is empty when the plan is idempotent. */
export function applyDepartmentIdBackfill<T extends DepartmentBackfillRow>(
  rows: readonly T[],
  updates: readonly DepartmentBackfillUpdate[]
): T[] {
  const idByCode = new Map<string, string>();
  for (const update of updates) {
    if (!idByCode.has(update.enumCode)) idByCode.set(update.enumCode, update.departmentId);
  }
  return rows.map((row) => {
    if (row.departmentId) return row;
    const departmentId = idByCode.get(row.enumCode);
    if (!departmentId) return row;
    return { ...row, departmentId };
  });
}

export function orderedDepartmentAlerts(input: {
  rows?: readonly DepartmentRefRecord[] | null;
  unavailable?: boolean;
  items: readonly { departmentId?: string | null; enumCode: string }[];
}): DepartmentOption[] {
  const catalog = resolveDepartmentCatalog({
    rows: input.rows,
    unavailable: input.unavailable,
  });
  const refsById = new Map(
    (input.unavailable ? [] : (input.rows ?? [])).map((row) => [row.id, row])
  );
  const names = new Map<string, string>();
  const sortOrders = new Map<string, number>();
  const order: string[] = [];
  const push = (code: string, name: string, sortOrder: number) => {
    if (!names.has(code)) order.push(code);
    names.set(code, name);
    if (!sortOrders.has(code)) sortOrders.set(code, sortOrder);
  };
  for (const option of catalog.departments) {
    push(option.code, option.name, option.sortOrder);
  }
  for (const item of input.items) {
    const resolved = resolveItemDepartment({
      departmentId: item.departmentId,
      enumCode: item.enumCode,
      refsById,
      unavailable: Boolean(input.unavailable),
    });
    if (!names.has(resolved.code)) {
      push(resolved.code, resolved.name, order.length * 10 + 1000);
    } else if (resolved.source === 'table') {
      names.set(resolved.code, resolved.name);
    }
  }
  return order.map((code) => ({
    code,
    name: names.get(code) ?? code,
    sortOrder: sortOrders.get(code) ?? 0,
  }));
}
