import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '@/lib/domains/inventory/ledger';
import {
  applySupplierMatchWrites,
  loadActiveSupplierProductLinks,
  matchInvoiceLine,
} from '@/lib/domains/receiving/supplierProductMatch';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';

/** True only for the CI database named freshloop_ci. Any other DATABASE_URL skips. */
function isFreshloopCiTestDatabase(url: string, dbTestsFlag: string | undefined): boolean {
  if (!url.trim() || dbTestsFlag === '0') return false;
  try {
    const database = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '');
    return database === 'freshloop_ci';
  } catch {
    return false;
  }
}

const hasCiDb = isFreshloopCiTestDatabase(databaseUrl, process.env.FRESHLOOP_DB_TESTS);

test('supplier match database test runs only when the database name is freshloop_ci', () => {
  const ci = 'postgresql://ci:ci@127.0.0.1:5432/freshloop_ci?schema=public';
  assert.equal(isFreshloopCiTestDatabase(ci, undefined), true);
  assert.equal(isFreshloopCiTestDatabase(ci, '0'), false);
  assert.equal(
    isFreshloopCiTestDatabase('postgresql://u:p@db.supabase.co:6543/postgres?pgbouncer=true', undefined),
    false
  );
  assert.equal(isFreshloopCiTestDatabase('postgresql://u:p@127.0.0.1:5432/freshloop', undefined), false);
  assert.equal(
    isFreshloopCiTestDatabase('postgresql://u:p@127.0.0.1:5432/freshloop_ci_backup', undefined),
    false
  );
});

test('supplier product links stay on the test database and roll back with the post', { skip: !hasCiDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `spm-${Date.now()}`;
  const supplier = await prisma.supplier.create({ data: { name: `Deodato ${stamp}` } });
  const other = await prisma.supplier.create({ data: { name: `Other ${stamp}` } });
  const active = await prisma.product.create({
    data: { name: `Apples ${stamp}`, department: 'PRODUCE', standardCost: 1, retailPrice: 2, shelfLifeDays: 4 },
  });
  const renamed = await prisma.product.create({
    data: { name: `Pears ${stamp}`, department: 'PRODUCE', standardCost: 1, retailPrice: 2, shelfLifeDays: 4 },
  });
  const inactive = await prisma.product.create({
    data: {
      name: `Retired ${stamp}`,
      department: 'PRODUCE',
      standardCost: 1,
      retailPrice: 2,
      shelfLifeDays: 4,
      catalogActive: false,
    },
  });
  const made = await prisma.product.create({
    data: {
      name: `Batch ${stamp}`,
      department: 'PRODUCE',
      standardCost: 1,
      retailPrice: 2,
      shelfLifeDays: 4,
      isManufactured: true,
    },
  });
  t.after(async () => {
    await prisma.supplierProductMatch.deleteMany({ where: { supplierId: { in: [supplier.id, other.id] } } });
    await prisma.product.deleteMany({ where: { id: { in: [active.id, renamed.id, inactive.id, made.id] } } });
    await prisma.supplier.deleteMany({ where: { id: { in: [supplier.id, other.id] } } });
  });

  await assert.rejects(() =>
    prisma.supplierProductMatch.create({
      data: {
        supplierId: supplier.id,
        matchType: 'fuzzy',
        matchKey: 'AB12',
        printedValue: 'AB12',
        productId: active.id,
        createdById: 'clerk',
        updatedById: 'clerk',
      },
    })
  );
  await assert.rejects(() =>
    prisma.supplierProductMatch.create({
      data: {
        supplierId: supplier.id,
        matchType: 'code',
        matchKey: '',
        printedValue: 'AB12',
        productId: active.id,
        createdById: 'clerk',
        updatedById: 'clerk',
      },
    })
  );

  await applySupplierMatchWrites(prisma, supplier.id, 'clerk', [
    { action: 'upsert', matchType: 'code', matchKey: 'AB12', printedValue: 'ab-12', productId: active.id },
  ]);
  await applySupplierMatchWrites(prisma, supplier.id, 'clerk-2', [
    { action: 'upsert', matchType: 'code', matchKey: 'AB12', printedValue: 'AB-12', productId: renamed.id },
  ]);
  await applySupplierMatchWrites(prisma, supplier.id, 'clerk', [
    {
      action: 'upsert',
      matchType: 'name',
      matchKey: 'hot house tomatoes on',
      printedValue: 'Hot House Tomatoes, ON',
      productId: active.id,
    },
    { action: 'upsert', matchType: 'code', matchKey: 'GONE', printedValue: 'GONE', productId: inactive.id },
    { action: 'upsert', matchType: 'code', matchKey: 'MADE', printedValue: 'MADE', productId: made.id },
  ]);

  const rows = await prisma.supplierProductMatch.findMany({ where: { supplierId: supplier.id, matchKey: 'AB12' } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.productId, renamed.id);
  assert.equal(rows[0]?.updatedById, 'clerk-2');

  const links = await loadActiveSupplierProductLinks(supplier.id);
  assert.equal(links.some((link) => link.matchKey === 'GONE' || link.matchKey === 'MADE'), false);
  const coded = matchInvoiceLine({
    code: ' ab-12 ',
    name: 'not the product',
    links,
    catalog: links.map((link) => ({ id: link.productId, name: link.productName })),
  });
  assert.equal(coded.source, 'code');
  assert.equal(coded.product?.id, renamed.id);
  const learned = matchInvoiceLine({
    name: 'HOT HOUSE TOMATOES ON',
    links,
    catalog: links.map((link) => ({ id: link.productId, name: link.productName })),
  });
  assert.equal(learned.source, 'learned_name');
  const elsewhere = await loadActiveSupplierProductLinks(other.id);
  assert.equal(elsewhere.length, 0);
  assert.notEqual(
    matchInvoiceLine({
      name: 'HOT HOUSE TOMATOES ON',
      links: elsewhere,
      catalog: [{ id: active.id, name: active.name }],
    }).source,
    'learned_name'
  );

  await assert.rejects(
    prisma.$transaction(async (tx) => {
      await applySupplierMatchWrites(tx, supplier.id, 'clerk', [
        { action: 'upsert', matchType: 'code', matchKey: 'ROLL', printedValue: 'ROLL', productId: active.id },
      ]);
      throw new Error('rollback');
    })
  );
  assert.equal(await prisma.supplierProductMatch.count({ where: { supplierId: supplier.id, matchKey: 'ROLL' } }), 0);

  await applySupplierMatchWrites(prisma, supplier.id, 'clerk', [
    { action: 'delete', matchType: 'code', matchKey: 'AB12', printedValue: 'AB-12' },
    { action: 'delete', matchType: 'name', matchKey: 'hot house tomatoes on', printedValue: 'Hot House Tomatoes, ON' },
  ]);
  assert.equal(await prisma.supplierProductMatch.count({ where: { supplierId: supplier.id, matchKey: 'AB12' } }), 0);
  assert.equal(
    await prisma.supplierProductMatch.count({ where: { supplierId: supplier.id, matchKey: 'hot house tomatoes on' } }),
    0
  );
});
