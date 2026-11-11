import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/orders/purchase-order-email/route';
import { setManagerStaffTestAuth } from '@/lib/auth/managerStaffTestAuth';
import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';
import { prisma } from '@/lib/db/prisma';
import { purchaseOrderLineKey } from '@/components/features/orders/supplierMail';

function manager(overrides: Partial<AuthSessionUser> = {}): AuthSessionUser {
  return {
    id: 'po-email-manager',
    name: 'Jane Doe',
    email: 'jane@store.test',
    role: 'STORE_MANAGER',
    position: 'Staff',
    hourlyRate: null,
    ...overrides,
  };
}

function request(body: unknown) {
  return new NextRequest('http://localhost/api/orders/purchase-order-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const configured = {
  PO_FROM_EMAIL: 'FreshLoop Orders <orders@freshloop.test>',
  PO_REPLY_TO: 'desk@freshloop.test',
  RESEND_API_KEY: 're_test_key',
};

const staffFrom = 'Jane Doe <orders@freshloop.test>';

async function withEnv(values: Record<string, string | undefined>, run: () => Promise<void>) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function mockResend(handler: (body: Record<string, unknown>) => Response) {
  const original = globalThis.fetch;
  const calls: Record<string, unknown>[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.includes('api.resend.com/emails')) return original(input, init);
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push(body);
    return handler(body);
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

describe('purchase order email route', { concurrency: 1 }, () => {
test('refuses the wrong role, an empty To, and missing mail settings', async () => {
  const resend = mockResend(() => new Response(JSON.stringify({ id: 'should-not-send' }), { status: 200 }));
  try {
    setManagerStaffTestAuth(async () => ({ ...manager(), role: 'FLOOR_STAFF' }));
    const floor = await POST(request({ supplierName: 'Farm', to: 'a@b.test', subject: 'PO', body: '1', productIds: ['p1'] }));
    assert.equal(floor.status, 403);

    setManagerStaffTestAuth(async () => manager());
    await withEnv(configured, async () => {
      const empty = await POST(
        request({ supplierName: 'Farm', to: '   ', subject: 'PO', body: '1', productIds: ['p1'] })
      );
      assert.equal(empty.status, 400);
      const emptyJson = (await empty.json()) as { error?: string };
      assert.match(emptyJson.error ?? '', /one supplier email/);

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

      const spoofed = await POST(
        request({
          supplierName: 'Farm',
          to: 'buyer@farm.test',
          subject: 'PO',
          body: '1',
          productIds: ['p1'],
          from: 'Evil <evil@example.com>',
          replyTo: 'evil@example.com',
        })
      );
      assert.equal(spoofed.status, 400);
    });

    await withEnv(
      { PO_FROM_EMAIL: undefined, PO_REPLY_TO: 'desk@freshloop.test', RESEND_API_KEY: undefined },
      async () => {
        const missing = await POST(
          request({ supplierName: 'Farm', to: 'buyer@farm.test', subject: 'PO', body: '1', productIds: ['p1'] })
        );
        assert.equal(missing.status, 503);
        const json = (await missing.json()) as { code?: string; error?: string };
        assert.equal(json.code, 'EMAIL_NOT_CONFIGURED');
        assert.match(json.error ?? '', /PO_FROM_EMAIL/);
        assert.match(json.error ?? '', /RESEND_API_KEY/);
        assert.equal((json.error ?? '').includes('PO_REPLY_TO'), false);
      }
    );
    assert.equal(resend.calls.length, 0);
  } finally {
    resend.restore();
    setManagerStaffTestAuth(null);
  }
});

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
const hasDb = Boolean(databaseUrl) && process.env.FRESHLOOP_DB_TESTS !== '0';

test('sends one supplier once and blocks a repeat', { skip: !hasDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `po-send-${Date.now()}`;
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
  let providerStatus = 200;
  const resend = mockResend(() => {
    if (providerStatus !== 200) return new Response('provider down', { status: providerStatus });
    return new Response(JSON.stringify({ id: 're_provider_1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  t.after(async () => {
    resend.restore();
    setManagerStaffTestAuth(null);
    await prisma.purchaseOrderEmail.deleteMany({
      where: { OR: [{ supplierId: supplier.id }, { supplierName: supplier.name }] },
    });
    await prisma.supplier.delete({ where: { id: supplier.id } });
  });

  setManagerStaffTestAuth(async () => manager());
  await withEnv(configured, async () => {
    const missingSupplier = await POST(
      request({
        supplierName: `Missing ${stamp}`,
        to: 'buyer@farm.test',
        subject: 'Purchase order',
        body: '1 case',
        productIds: [`missing-${stamp}`],
      })
    );
    assert.equal(missingSupplier.status, 400);
    const missingJson = (await missingSupplier.json()) as { error?: string };
    assert.match(missingJson.error ?? '', /saved supplier is required/);
    assert.equal(resend.calls.length, 0);

    providerStatus = 500;
    const failed = await POST(request(payload));
    assert.equal(failed.status, 502);
    assert.equal(resend.calls.length, 1);
    assert.deepEqual(resend.calls[0]?.to, ['edited@farm.test']);
    assert.equal(resend.calls[0]?.from, staffFrom);
    assert.equal(resend.calls[0]?.reply_to, 'jane@store.test');
    const lineKey = purchaseOrderLineKey({
      supplier: payload.supplierName,
      productIds: payload.productIds,
      body: payload.body,
    });
    const failedRow = await prisma.purchaseOrderEmail.findFirst({
      where: { supplierId: supplier.id, lineKey },
    });
    assert.equal(failedRow?.status, 'FAILED');
    assert.equal(failedRow?.toEmail, 'edited@farm.test');
    assert.equal(failedRow?.fromEmail, staffFrom);
    assert.equal(failedRow?.replyTo, 'jane@store.test');
    assert.notEqual(failedRow?.toEmail, 'stored@farm.test');

    providerStatus = 200;
    const sent = await POST(request(payload));
    assert.equal(sent.status, 200);
    const sentJson = (await sent.json()) as { providerId?: string; status?: string };
    assert.equal(sentJson.providerId, 're_provider_1');
    assert.equal(sentJson.status, 'SENT');
    assert.equal(resend.calls.length, 2);

    const again = await POST(request(payload));
    assert.equal(again.status, 409);
    const againJson = (await again.json()) as { error?: string; status?: string };
    assert.equal(againJson.status, 'SENT');
    assert.match(againJson.error ?? '', /already sent/);
    assert.equal(resend.calls.length, 2);

    const pending = await prisma.purchaseOrderEmail.create({
      data: {
        supplierId: supplier.id,
        supplierName: supplier.name,
        toEmail: payload.to,
        fromEmail: staffFrom,
        replyTo: 'jane@store.test',
        subject: payload.subject,
        body: 'other lines',
        lineKey: purchaseOrderLineKey({
          supplier: payload.supplierName,
          productIds: payload.productIds,
          body: 'other lines',
        }),
        status: 'PENDING',
        actorId: manager().id,
      },
    });
    const blocked = await POST(request({ ...payload, body: 'other lines' }));
    assert.equal(blocked.status, 409);
    assert.equal(resend.calls.length, 2);
    await prisma.purchaseOrderEmail.delete({ where: { id: pending.id } });

    setManagerStaffTestAuth(async () => manager({ email: '' }));
    const fallback = await POST(request({ ...payload, body: `${payload.body}\nfallback` }));
    assert.equal(fallback.status, 200);
    assert.equal(resend.calls.at(-1)?.reply_to, 'desk@freshloop.test');
    assert.equal(resend.calls.at(-1)?.from, staffFrom);
    const fallbackKey = purchaseOrderLineKey({
      supplier: payload.supplierName,
      productIds: payload.productIds,
      body: `${payload.body}\nfallback`,
    });
    const fallbackRow = await prisma.purchaseOrderEmail.findFirst({
      where: { supplierId: supplier.id, lineKey: fallbackKey },
    });
    assert.equal(fallbackRow?.replyTo, 'desk@freshloop.test');
    assert.equal(fallbackRow?.toEmail, 'edited@farm.test');

    setManagerStaffTestAuth(async () => manager({ name: 'Doe, Jane', email: '   ' }));
    delete process.env.PO_REPLY_TO;
    const quoted = await POST(request({ ...payload, body: `${payload.body}\nquoted` }));
    assert.equal(quoted.status, 200);
    assert.equal(resend.calls.at(-1)?.from, '"Doe, Jane" <orders@freshloop.test>');
    assert.equal('reply_to' in (resend.calls.at(-1) ?? {}), false);
    const quotedKey = purchaseOrderLineKey({
      supplier: payload.supplierName,
      productIds: payload.productIds,
      body: `${payload.body}\nquoted`,
    });
    const quotedRow = await prisma.purchaseOrderEmail.findFirst({
      where: { supplierId: supplier.id, lineKey: quotedKey },
    });
    assert.equal(quotedRow?.fromEmail, '"Doe, Jane" <orders@freshloop.test>');
    assert.equal(quotedRow?.replyTo, null);
  });
});
});
