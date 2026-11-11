import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '@/lib/domains/inventory/ledger';
import { postReceipt } from '@/lib/domains/inventory/stock';
import { RECEIVING_DEPARTMENT_REQUIRED } from '@/lib/domains/inventory/receivingDepartment';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

test('receiving assigns a department and does not file an unknown item as produce', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  const stamp = `dept-${Date.now()}`;
  const milk = `Whole Milk ${stamp}`;
  const loaf = `Sourdough ${stamp}`;
  const gadget = `Mystery Gadget ${stamp}`;
  const createdIds: string[] = [];
  t.after(async () => {
    if (createdIds.length === 0) return;
    await prisma.inventoryLot.deleteMany({ where: { productId: { in: createdIds } } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: { in: createdIds } } });
    await prisma.product.deleteMany({ where: { id: { in: createdIds } } });
  });

  const dairy = await postReceipt({
    itemName: milk,
    casesReceived: 1,
    caseCost: 4,
    packSize: 1,
    splitFactor: 1,
    retailPrice: 6,
    staffId: 'staff-voice',
  });
  assert.equal(dairy.posted, true);
  if (!dairy.posted) return;
  createdIds.push(dairy.productId);
  const dairyRow = await prisma.product.findUnique({
    where: { id: dairy.productId },
    select: { department: true },
  });
  assert.equal(dairyRow?.department, 'DAIRY');

  const explicit = await postReceipt({
    itemName: loaf,
    casesReceived: 1,
    caseCost: 3,
    packSize: 1,
    splitFactor: 1,
    retailPrice: 5,
    staffId: 'staff-voice',
    department: 'DAIRY',
  });
  assert.equal(explicit.posted, true);
  if (!explicit.posted) return;
  createdIds.push(explicit.productId);
  const explicitRow = await prisma.product.findUnique({
    where: { id: explicit.productId },
    select: { department: true },
  });
  assert.equal(explicitRow?.department, 'DAIRY');

  const unknown = await postReceipt({
    itemName: gadget,
    casesReceived: 1,
    caseCost: 2,
    packSize: 1,
    splitFactor: 1,
    retailPrice: 3,
    staffId: 'staff-voice',
  });
  assert.equal(unknown.posted, false);
  if (unknown.posted) return;
  assert.equal(unknown.reason, RECEIVING_DEPARTMENT_REQUIRED);
  const leftover = await prisma.product.findFirst({ where: { name: gadget }, select: { id: true, department: true } });
  assert.equal(leftover, null);
});
