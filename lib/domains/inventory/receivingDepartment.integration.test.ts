import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/receiving-logs/batch/route';
import { setReceivingStaffTestAuth } from '@/lib/auth/receivingStaffTestAuth';
import { prisma } from '@/lib/domains/inventory/ledger';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

function line(itemName: string, externalLogId: string, screenDepartment?: string) {
  return {
    itemName,
    casesReceived: 1,
    caseCost: 4,
    packSize: 1,
    splitFactor: 1,
    retailUnit: 'units',
    marginMode: '40',
    currentRetailPrice: 6,
    externalLogId,
    ...(screenDepartment ? { screenDepartment } : {}),
  };
}

test('an unclear receiving line blocks the whole save until a department is picked', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }
  setReceivingStaffTestAuth(async () => ({
    id: 'staff-voice',
    name: 'Clerk',
    email: 'clerk@example.com',
    role: 'RECEIVING_CLERK',
    position: 'Receiver',
    hourlyRate: null,
  }));
  const stamp = `dept-${Date.now()}`;
  const milk = `Whole Milk ${stamp}`;
  const gadget = `Mystery Gadget ${stamp}`;
  const milkId = crypto.randomUUID();
  const gadgetId = crypto.randomUUID();
  const pickedMilkId = crypto.randomUUID();
  const pickedGadgetId = crypto.randomUUID();
  t.after(async () => {
    setReceivingStaffTestAuth(null);
    const products = await prisma.product.findMany({
      where: { name: { in: [milk, gadget] } },
      select: { id: true },
    });
    const productIds = products.map((row) => row.id);
    const deliveryIds = [milkId, gadgetId, pickedMilkId, pickedGadgetId];
    if (productIds.length > 0) {
      await prisma.inventoryLot.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.inventoryTransaction.deleteMany({ where: { productId: { in: productIds } } });
    }
    await prisma.receivingDelivery.deleteMany({ where: { id: { in: deliveryIds } } });
    await prisma.ledgerIdempotencyKey.deleteMany({
      where: { key: { in: deliveryIds.map((id) => `recv:${id}`) } },
    });
    if (productIds.length > 0) {
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }
  });

  const blocked = await POST(
    new NextRequest('http://localhost/api/receiving-logs/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [line(milk, milkId), line(gadget, gadgetId)] }),
    })
  );
  const blockedBody = (await blocked.json()) as {
    field?: string;
    fieldErrors?: Array<{ field?: string; itemName?: string }>;
  };
  assert.equal(blocked.status, 400);
  assert.equal(blockedBody.field, 'department');
  assert.equal(blockedBody.fieldErrors?.length, 1);
  assert.equal(blockedBody.fieldErrors?.[0]?.itemName, gadget);
  assert.equal(await prisma.product.count({ where: { name: { in: [milk, gadget] } } }), 0);
  assert.equal(await prisma.receivingDelivery.count({ where: { id: { in: [milkId, gadgetId] } } }), 0);

  const saved = await POST(
    new NextRequest('http://localhost/api/receiving-logs/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: [line(milk, pickedMilkId), line(gadget, pickedGadgetId, 'DELI_KITCHEN')],
      }),
    })
  );
  assert.equal(saved.status, 200);
  const milkRow = await prisma.product.findFirst({ where: { name: milk }, select: { department: true } });
  const gadgetRow = await prisma.product.findFirst({ where: { name: gadget }, select: { department: true } });
  assert.equal(milkRow?.department, 'DAIRY');
  assert.equal(gadgetRow?.department, 'DELI_KITCHEN');

  const towels = `Paper Towels ${stamp}`;
  const towelId = crypto.randomUUID();
  t.after(async () => {
    const towel = await prisma.product.findFirst({ where: { name: towels }, select: { id: true } });
    if (!towel) return;
    await prisma.inventoryLot.deleteMany({ where: { productId: towel.id } });
    await prisma.inventoryTransaction.deleteMany({ where: { productId: towel.id } });
    await prisma.receivingDelivery.deleteMany({ where: { id: towelId } });
    await prisma.ledgerIdempotencyKey.deleteMany({ where: { key: `recv:${towelId}` } });
    await prisma.product.deleteMany({ where: { id: towel.id } });
  });
  const grocery = await POST(
    new NextRequest('http://localhost/api/receiving-logs/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [line(towels, towelId)] }),
    })
  );
  assert.equal(grocery.status, 200);
  const towelRow = await prisma.product.findFirst({ where: { name: towels }, select: { department: true } });
  assert.equal(towelRow?.department, 'GROCERY');
});
