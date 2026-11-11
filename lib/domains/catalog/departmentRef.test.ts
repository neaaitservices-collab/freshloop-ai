import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { Department } from '@prisma/client';
import { DEPARTMENT_LABELS } from '@/lib/domains/inventory/inventoryCatalog';
import {
  DEPARTMENT_BACKFILL_TABLES,
  DEPARTMENT_REF_BACKFILL_SCRIPT,
  DEPARTMENT_REF_MIGRATION,
  DEPARTMENT_REF_SEED,
  applyDepartmentIdBackfill,
  departmentBackfillSql,
  departmentIdColumns,
  departmentRefSeedSql,
  enumDepartmentOptions,
  orderedDepartmentAlerts,
  planDepartmentIdBackfill,
  resolveDepartmentCatalog,
  resolveItemDepartment,
} from '@/lib/domains/catalog/departmentRef';

const produceId = DEPARTMENT_REF_SEED.find((row) => row.code === 'PRODUCE')?.id ?? '';
const groceryId = DEPARTMENT_REF_SEED.find((row) => row.code === 'GROCERY')?.id ?? '';

test('seed rows cover every Department enum value and the catalogue label', () => {
  const codes = DEPARTMENT_REF_SEED.map((row) => row.code);
  assert.deepEqual(codes, Object.values(Department));
  assert.equal(new Set(codes).size, codes.length);
  for (const row of DEPARTMENT_REF_SEED) {
    assert.equal(row.name, DEPARTMENT_LABELS[row.code]);
    assert.equal(row.active, true);
    assert.ok(row.sortOrder > 0);
  }
  assert.equal(DEPARTMENT_REF_SEED.find((row) => row.code === 'DELI_KITCHEN')?.name, 'Deli / Production');
  assert.equal(DEPARTMENT_REF_SEED.find((row) => row.code === 'GROCERY')?.name, 'Grocery');
});

test('an empty or unavailable department table falls back to the enum labels', () => {
  const fallback = enumDepartmentOptions();
  assert.deepEqual(resolveDepartmentCatalog({ rows: [], unavailable: false }), {
    source: 'enum',
    departments: fallback,
  });
  assert.deepEqual(resolveDepartmentCatalog({ rows: null, unavailable: true }), {
    source: 'enum',
    departments: fallback,
  });
  assert.deepEqual(
    resolveDepartmentCatalog({
      rows: [{ id: 'x', code: 'PRODUCE', name: 'Hidden', active: false, sortOrder: 1 }],
      unavailable: false,
    }),
    { source: 'enum', departments: fallback }
  );
  assert.deepEqual(
    fallback.map((row) => row.code),
    ['PRODUCE', 'DAIRY', 'BAKERY', 'PANTRY', 'DELI_KITCHEN', 'GROCERY']
  );
});

test('picker options come from active table rows in sort order', () => {
  const catalog = resolveDepartmentCatalog({
    rows: [
      { id: 'g', code: 'GROCERY', name: 'Dry Grocery', active: true, sortOrder: 5 },
      { id: 'p', code: 'PRODUCE', name: 'Produce', active: true, sortOrder: 20 },
      { id: 'off', code: 'DAIRY', name: 'Dairy', active: false, sortOrder: 1 },
    ],
  });
  assert.equal(catalog.source, 'table');
  assert.deepEqual(
    catalog.departments.map((row) => [row.code, row.name]),
    [
      ['GROCERY', 'Dry Grocery'],
      ['PRODUCE', 'Produce'],
    ]
  );
});

test('a null departmentId or a missing ref falls back to the enum column', () => {
  const refsById = new Map([
    [groceryId, { code: 'GROCERY', name: 'Grocery' }],
    [produceId, { code: 'PRODUCE', name: 'Produce' }],
  ]);
  assert.deepEqual(
    resolveItemDepartment({ departmentId: groceryId, enumCode: 'PRODUCE', refsById }),
    { code: 'GROCERY', name: 'Grocery', source: 'table' }
  );
  assert.deepEqual(
    resolveItemDepartment({ departmentId: null, enumCode: 'DAIRY', refsById }),
    { code: 'DAIRY', name: 'Dairy', source: 'enum' }
  );
  assert.deepEqual(
    resolveItemDepartment({ departmentId: 'missing', enumCode: 'BAKERY', refsById }),
    { code: 'BAKERY', name: 'Bakery', source: 'enum' }
  );
  assert.deepEqual(
    resolveItemDepartment({
      departmentId: groceryId,
      enumCode: 'PRODUCE',
      refsById,
      unavailable: true,
    }),
    { code: 'PRODUCE', name: 'Produce', source: 'enum' }
  );
});

test('department stats use table names and keep an enum bucket when departmentId is null', () => {
  const slots = orderedDepartmentAlerts({
    rows: [
      { id: groceryId, code: 'GROCERY', name: 'Dry Grocery', active: true, sortOrder: 10 },
      { id: produceId, code: 'PRODUCE', name: 'Produce', active: true, sortOrder: 20 },
    ],
    items: [
      { departmentId: groceryId, enumCode: 'PANTRY' },
      { departmentId: null, enumCode: 'DAIRY' },
    ],
  });
  assert.deepEqual(
    slots.map((slot) => [slot.code, slot.name]),
    [
      ['GROCERY', 'Dry Grocery'],
      ['PRODUCE', 'Produce'],
      ['DAIRY', 'Dairy'],
    ]
  );
});

test('backfill fills null department ids once and leaves existing ids alone', () => {
  const codeToId = new Map(DEPARTMENT_REF_SEED.map((row) => [row.code, row.id]));
  const rows = [
    { departmentId: null, enumCode: 'PRODUCE' },
    { departmentId: groceryId, enumCode: 'DAIRY' },
    { departmentId: null, enumCode: 'NOT_A_DEPARTMENT' },
    { departmentId: null, enumCode: 'BAKERY' },
  ];
  const updates = planDepartmentIdBackfill(rows, codeToId);
  assert.deepEqual(updates, [
    { enumCode: 'PRODUCE', departmentId: produceId },
    { enumCode: 'BAKERY', departmentId: codeToId.get('BAKERY') },
  ]);
  const filled = applyDepartmentIdBackfill(rows, updates);
  assert.equal(filled[0]?.departmentId, produceId);
  assert.equal(filled[1]?.departmentId, groceryId);
  assert.equal(filled[2]?.departmentId, null);
  assert.deepEqual(planDepartmentIdBackfill(filled, codeToId), []);
});

test('writes set departmentId when the table is readable and omit it when it is not', () => {
  const codeToId = new Map([['PRODUCE', produceId]]);
  assert.deepEqual(departmentIdColumns('PRODUCE', codeToId), { departmentId: produceId });
  assert.deepEqual(departmentIdColumns('DAIRY', codeToId), { departmentId: null });
  assert.deepEqual(departmentIdColumns('PRODUCE', null), {});
  assert.deepEqual(departmentIdColumns('PRODUCE', new Map()), { departmentId: null });
});

test('migration and backfill script contain the idempotent seed and updates', () => {
  const migration = fs.readFileSync(path.join(process.cwd(), DEPARTMENT_REF_MIGRATION), 'utf8');
  const script = fs.readFileSync(path.join(process.cwd(), DEPARTMENT_REF_BACKFILL_SCRIPT), 'utf8');
  const seed = departmentRefSeedSql();
  const backfill = departmentBackfillSql();
  assert.ok(migration.includes(seed));
  assert.ok(migration.includes(backfill));
  assert.ok(script.includes(seed));
  assert.ok(script.includes(backfill));
  assert.match(seed, /ON CONFLICT \("code"\) DO NOTHING/);
  for (const table of DEPARTMENT_BACKFILL_TABLES) {
    assert.match(backfill, new RegExp(`UPDATE "${table}"`));
    assert.match(backfill, /"department_id" IS NULL/);
  }
  assert.match(migration, /NELSON-APPROVED/);
  assert.match(script, /without Nelson's approval/);
});
