import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/orders/purchase-order-email/route';
import { setManagerStaffTestAuth } from '@/lib/auth/managerStaffTestAuth';
import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';
import { prisma } from '@/lib/db/prisma';
import { purchaseOrderLineKey, purchaseOrderOpenedWarning } from '@/components/features/orders/supplierMail';

function manager(): AuthSessionUser {
  return {
    id: 'po-email-manager',
    name: 'Jane Doe',
    email: 'jane@store.test',
    role: 'STORE_MANAGER',
    position: 'Staff',
    hourlyRate: null,
  };
}

function request(body: unknown) {
  return new NextRequest('http://localhost/api/orders/purchase-order-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('purchase order open log', { concurrency: 1 }, () => {
  test('refuses the wrong role and an invalid To, and does not call a mail provider', async () => {
    const route = readFileSync('app/api/orders/purchase-order-email/route.ts', 'utf8');
    const panel = readFileSync('components/features/orders/PoEmailPanel.tsx', 'utf8');
    const store = readFileSync('lib/domains/orders/purchaseOrderEmailStore.ts', 'utf8');
    for (const source of [route, panel, store]) {
      assert.equal(/resend/i.test(source), false);
      assert.equal(source.includes('PO_FROM_EMAIL'), false);
      assert.equal(source.includes('PO_REPLY_TO'), false);
      assert.equal(/\bsent\b/i.test(source), false);
    }
    assert.match(route, /requireManagerStaff/);
    assert.ok(route.indexOf('requireManagerStaff') < route.indexOf('recordPurchaseOrderOpen'));

    try {
      setManagerStaffTestAuth(async () => ({ ...manager(), role: 'FLOOR_STAFF' }));
      const floor = await POST(
        request({ supplierName: 'Farm', to: 'buyer@farm.test', subject: 'PO', body: '1', productIds: ['p1'] })
      );
      assert.equal(floor.status, 403);

      setManagerStaffTestAuth(async () => manager());
      const empty = await POST(
        request({ supplierName: 'Farm', to: '   ', subject: 'PO', body: '1', productIds: ['p1'] })
      );
      assert.equal(empty.status, 400);
      const listed = await POST(
        request({
          supplierName: 'Farm',
          to: 'buyer@farm.test, other@farm.test',
          subject: 'PO',
          body: '1',
          productIds: ['p1'],
        })
      );
      assert.equal(listed.status, 400);
      const listedJson = (await listed.json()) as { error?: string };
      assert.match(listedJson.error ?? '', /one supplier email/);
    } finally {
      setManagerStaffTestAuth(null);
    }
  });

  const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
  const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

  test('records the edited To and warns before opening the same order again', { skip: !hasDb }, async (t) => {
    try {
      await prisma.$connect();
    } catch {
      t.skip('Database unreachable.');
      return;
    }

    const stamp = `po-open-${Date.now()}`;
    const supplier = await prisma.supplier.create({
      data: { name: `Farm ${stamp}`, contactEmail: 'stored@farm.test' },
    });
    const payload = {
      supplierId: supplier.id,
      supplierName: supplier.name,
      to: 'edited@farm.test',
      subject: 'Purchase order',
      body: `2 cases - Bananas ${stamp}`,
      productIds: [`banana-${stamp}`],
    };

    t.after(async () => {
      setManagerStaffTestAuth(null);
      await prisma.purchaseOrderEmail.deleteMany({
        where: { OR: [{ supplierId: supplier.id }, { supplierName: supplier.name }] },
      });
      await prisma.supplier.delete({ where: { id: supplier.id } });
    });

    setManagerStaffTestAuth(async () => manager());
    const opened = await POST(request(payload));
    assert.equal(opened.status, 200);
    const openedJson = (await opened.json()) as { status?: string; openedAt?: string };
    assert.equal(openedJson.status, 'OPENED');
    const lineKey = purchaseOrderLineKey({
      supplier: payload.supplierName,
      productIds: payload.productIds,
      body: payload.body,
    });
    const row = await prisma.purchaseOrderEmail.findFirst({
      where: { supplierId: supplier.id, lineKey },
    });
    assert.equal(row?.toEmail, 'edited@farm.test');
    assert.equal(row?.status, 'OPENED');
    assert.notEqual(row?.toEmail, 'stored@farm.test');

    const again = await POST(request(payload));
    assert.equal(again.status, 409);
    const againJson = (await again.json()) as { openedAt?: string; status?: string };
    assert.equal(againJson.status, 'OPENED');
    assert.equal(againJson.openedAt, openedJson.openedAt);
    assert.match(purchaseOrderOpenedWarning(againJson.openedAt ?? ''), /Already opened for this order on .+ open again\?/);

    const reopened = await POST(
      request({ ...payload, to: 'later@farm.test', subject: 'Changed', body: payload.body, reopen: true })
    );
    assert.equal(reopened.status, 200);
    const updated = await prisma.purchaseOrderEmail.findFirst({
      where: { supplierId: supplier.id, lineKey },
    });
    assert.equal(updated?.toEmail, 'edited@farm.test');
    assert.equal(updated?.body, payload.body);
    assert.equal(updated?.subject, payload.subject);
    assert.equal(updated?.actorId, manager().id);
    assert.equal(updated?.createdAt.toISOString(), openedJson.openedAt);
  });

  test('a group pre-check reads an open and does not insert a row', { skip: !hasDb }, async (t) => {
    try {
      await prisma.$connect();
    } catch {
      t.skip('Database unreachable.');
      return;
    }

    const stamp = `po-check-${Date.now()}`;
    const supplier = await prisma.supplier.create({
      data: { name: `Farm ${stamp}`, contactEmail: 'stored@farm.test' },
    });
    const payload = {
      supplierId: supplier.id,
      supplierName: supplier.name,
      to: 'edited@farm.test',
      subject: 'Purchase order',
      body: `2 cases - Bananas ${stamp}`,
      productIds: [`banana-${stamp}`],
    };

    t.after(async () => {
      setManagerStaffTestAuth(null);
      await prisma.purchaseOrderEmail.deleteMany({
        where: { OR: [{ supplierId: supplier.id }, { supplierName: supplier.name }] },
      });
      await prisma.supplier.delete({ where: { id: supplier.id } });
    });

    setManagerStaffTestAuth(async () => manager());
    const checked = await POST(request({ ...payload, checkOnly: true }));
    assert.equal(checked.status, 200);
    const checkedJson = (await checked.json()) as { status?: string };
    assert.equal(checkedJson.status, 'READY');
    assert.equal(await prisma.purchaseOrderEmail.count({ where: { supplierId: supplier.id } }), 0);

    const opened = await POST(request(payload));
    assert.equal(opened.status, 200);
    const again = await POST(request({ ...payload, checkOnly: true }));
    assert.equal(again.status, 409);
    assert.equal(await prisma.purchaseOrderEmail.count({ where: { supplierId: supplier.id } }), 1);
  });
});
