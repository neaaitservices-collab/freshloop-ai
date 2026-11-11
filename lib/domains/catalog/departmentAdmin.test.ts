import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { canEditDepartments, canViewDepartments } from '@/lib/auth/staffCapabilities';
import {
  DEPARTMENT_CODE_PERMANENT,
  DEPARTMENT_CREATE_DISABLED,
  DEPARTMENT_NOT_DELETED,
  departmentCodeChangeError,
  departmentUpdateFields,
  normalizeDepartmentCode,
  runDepartmentAdmin,
  type DepartmentAdminDb,
} from '@/lib/domains/catalog/departmentAdmin';
import type { DepartmentRefRecord } from '@/lib/domains/catalog/departmentRef';
import { ROLES, type RoleName } from '@/lib/utils/roles';

const PRODUCE_ID = 'd1000000-0000-4000-8000-000000000001';

function row(partial: Partial<DepartmentRefRecord> & Pick<DepartmentRefRecord, 'id' | 'code'>): DepartmentRefRecord {
  return {
    name: partial.name ?? partial.code,
    active: partial.active ?? true,
    sortOrder: partial.sortOrder ?? 10,
    ...partial,
  };
}

function memoryDb(seed: DepartmentRefRecord[] = []): DepartmentAdminDb & {
  calls: string[];
  updates: Array<{ id: string; data: { name?: string; active?: boolean } }>;
} {
  const rows = seed.map((item) => ({ ...item }));
  const calls: string[] = [];
  const updates: Array<{ id: string; data: { name?: string; active?: boolean } }> = [];
  return {
    calls,
    updates,
    async ready() {
      calls.push('ready');
      return true;
    },
    async list() {
      calls.push('list');
      return rows.map((item) => ({ ...item }));
    },
    async insert(input) {
      calls.push('insert');
      const saved = row({
        id: 'd2000000-0000-4000-8000-000000000099',
        code: input.code,
        name: input.name,
        active: input.active,
        sortOrder: input.sortOrder,
      });
      rows.push(saved);
      return { ...saved };
    },
    async update(id, data) {
      calls.push('update');
      updates.push({ id, data: { ...data } });
      const index = rows.findIndex((item) => item.id === id);
      if (index < 0) return null;
      const saved = { ...rows[index], ...data };
      rows[index] = saved;
      return { ...saved };
    },
  };
}

test('department roles: admin edits, store manager reads, everyone else is refused', async () => {
  for (const role of ROLES) {
    assert.equal(canViewDepartments(role), role === 'ADMIN' || role === 'STORE_MANAGER', role);
    assert.equal(canEditDepartments(role), role === 'ADMIN', role);
  }
  assert.equal(canViewDepartments(null), false);
  assert.equal(canEditDepartments(undefined), false);

  const listed = [row({ id: PRODUCE_ID, code: 'PRODUCE', name: 'Produce', sortOrder: 10 })];
  for (const role of [null, ...ROLES] as Array<RoleName | null>) {
    const db = memoryDb(listed);
    const view = await runDepartmentAdmin({ role, method: 'GET', db });
    const create = await runDepartmentAdmin({
      role,
      method: 'POST',
      body: { code: 'FLORAL', name: 'Floral' },
      db,
    });
    const rename = await runDepartmentAdmin({
      role,
      method: 'PATCH',
      body: { id: PRODUCE_ID, name: 'Fresh produce' },
      db,
    });

    if (role === null) {
      assert.equal(view.status, 401);
      assert.equal(create.status, 401);
    } else if (role === 'ADMIN') {
      assert.equal(view.status, 200);
      assert.equal(create.status, 405);
      assert.equal(create.body.error, DEPARTMENT_CREATE_DISABLED);
      assert.equal(db.calls.includes('insert'), false);
      assert.equal(rename.status, 200);
    } else if (role === 'STORE_MANAGER') {
      assert.equal(view.status, 200);
      assert.equal(view.body.departments?.length, 1);
      assert.equal(create.status, 403);
      assert.equal(rename.status, 403);
      assert.equal(db.calls.includes('insert'), false);
      assert.equal(db.calls.includes('update'), false);
    } else {
      assert.equal(view.status, 403, role);
      assert.equal(create.status, 403, role);
      assert.equal(rename.status, 403, role);
      assert.deepEqual(db.calls, []);
    }
  }
});

test('departments are not deleted', async () => {
  const db = memoryDb([row({ id: PRODUCE_ID, code: 'PRODUCE' })]);
  const result = await runDepartmentAdmin({ role: 'ADMIN', method: 'DELETE', body: { id: PRODUCE_ID }, db });
  assert.equal(result.status, 405);
  assert.equal(result.body.error, DEPARTMENT_NOT_DELETED);
  assert.deepEqual(db.calls, []);
  assert.equal('delete' in db, false);

  const files = [
    'app/api/admin/departments/route.ts',
    'lib/domains/catalog/departmentAdmin.ts',
    'lib/domains/catalog/departmentAdminStore.ts',
    'components/features/admin/DepartmentAdminTable.tsx',
    'app/admin/departments/page.tsx',
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    assert.equal(source.includes('export async function DELETE'), false, file);
    assert.equal(source.includes('.delete('), false, file);
    assert.equal(source.includes('deleteMany'), false, file);
    assert.equal(/method:\s*['"]DELETE['"]/.test(source), false, file);
  }
});

test('department code is permanent and updates never write it', async () => {
  assert.equal(departmentCodeChangeError('PRODUCE', 'GROCERY'), DEPARTMENT_CODE_PERMANENT);
  assert.equal(departmentCodeChangeError('PRODUCE', 'produce'), null);
  const fields = departmentUpdateFields({ name: 'Fresh produce', active: false });
  assert.deepEqual(fields, { name: 'Fresh produce', active: false });
  assert.equal(Object.hasOwn(fields, 'code'), false);

  const db = memoryDb([
    row({ id: PRODUCE_ID, code: 'PRODUCE', name: 'Produce', active: true, sortOrder: 10 }),
  ]);
  const changed = await runDepartmentAdmin({
    role: 'ADMIN',
    method: 'PATCH',
    body: { id: PRODUCE_ID, code: 'GROCERY', name: 'Grocery' },
    db,
  });
  assert.equal(changed.status, 400);
  assert.equal(changed.body.error, DEPARTMENT_CODE_PERMANENT);
  assert.equal(db.updates.length, 0);
  assert.equal((await db.list())[0]?.code, 'PRODUCE');
  assert.equal((await db.list())[0]?.name, 'Produce');

  const sameCode = await runDepartmentAdmin({
    role: 'ADMIN',
    method: 'PATCH',
    body: { id: PRODUCE_ID, code: 'produce', name: 'Fresh produce' },
    db,
  });
  assert.equal(sameCode.status, 200);
  assert.equal(sameCode.body.department?.code, 'PRODUCE');
  assert.equal(sameCode.body.department?.name, 'Fresh produce');
  assert.deepEqual(db.updates.at(-1)?.data, { name: 'Fresh produce' });

  const toggled = await runDepartmentAdmin({
    role: 'ADMIN',
    method: 'PATCH',
    body: { id: PRODUCE_ID, active: false },
    db,
  });
  assert.equal(toggled.status, 200);
  assert.equal(toggled.body.department?.active, false);
  assert.equal(toggled.body.department?.code, 'PRODUCE');
  assert.deepEqual(db.updates.at(-1)?.data, { active: false });

  const restored = await runDepartmentAdmin({
    role: 'ADMIN',
    method: 'PATCH',
    body: { id: PRODUCE_ID, active: true },
    db,
  });
  assert.equal(restored.body.department?.active, true);
});

test('adding a department is rejected until the department enum is retired', async () => {
  assert.deepEqual(normalizeDepartmentCode(' floral '), { ok: true, value: 'FLORAL' });
  assert.equal(normalizeDepartmentCode('1FLORAL').ok, false);
  assert.equal(normalizeDepartmentCode('FLORAL_').ok, false);
  assert.equal(normalizeDepartmentCode('DELI__KITCHEN').ok, false);

  const db = memoryDb([row({ id: PRODUCE_ID, code: 'PRODUCE', sortOrder: 10 })]);
  const before = await db.list();
  db.calls.length = 0;

  for (const body of [
    { code: 'floral', name: '  Floral  ' },
    { code: 'PRODUCE', name: 'Produce again' },
    { code: 'bad code', name: 'Bad' },
    {},
  ]) {
    const created = await runDepartmentAdmin({
      role: 'ADMIN',
      method: 'POST',
      body,
      db,
    });
    assert.equal(created.status, 405);
    assert.equal(created.body.success, false);
    assert.equal(created.body.error, DEPARTMENT_CREATE_DISABLED);
    assert.equal(created.body.department, undefined);
  }

  assert.deepEqual(db.calls, []);
  assert.deepEqual(await db.list(), before);
});

test('the department route enforces roles on the server and has no delete handler', () => {
  const route = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/departments/route.ts'), 'utf8');
  const page = fs.readFileSync(path.join(process.cwd(), 'app/admin/departments/page.tsx'), 'utf8');
  const ui = fs.readFileSync(
    path.join(process.cwd(), 'components/features/admin/DepartmentAdminTable.tsx'),
    'utf8'
  );

  const getAt = route.indexOf('export async function GET');
  const postAt = route.indexOf('export async function POST');
  const patchAt = route.indexOf('export async function PATCH');
  assert.ok(getAt >= 0 && postAt > getAt && patchAt > postAt);
  assert.ok(route.indexOf('requireDepartmentViewer', getAt) < route.indexOf('runDepartmentAdmin', getAt));
  assert.ok(route.indexOf('requireDepartmentEditor', postAt) < route.indexOf('runDepartmentAdmin', postAt));
  assert.ok(route.indexOf('requireDepartmentEditor', patchAt) < route.indexOf('runDepartmentAdmin', patchAt));
  assert.match(route, /role: actor\.role/);
  assert.equal(route.includes('export async function DELETE'), false);

  const guardAt = page.indexOf('guardFreshPage');
  const loadAt = page.indexOf('loadAdminDepartments');
  assert.ok(guardAt >= 0 && loadAt > guardAt);
  assert.match(page, /canEditDepartments\(user\.role\)/);
  assert.equal(ui.includes('method: \'DELETE\''), false);
  assert.equal(ui.includes('>Delete<'), false);
  assert.equal(ui.includes('Add department'), false);
  assert.equal(/method:\s*'POST'/.test(ui), false);
  assert.match(ui, /The code stays the same/);
  assert.match(ui, /Rename department/);
  assert.match(ui, /canEdit \?/);
});
