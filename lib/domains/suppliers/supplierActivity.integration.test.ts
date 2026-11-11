import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/admin/suppliers/[id]/activity/route';
import { PATCH } from '@/app/api/admin/suppliers/[id]/activity/[activityId]/route';
import { POST as voidActivity } from '@/app/api/admin/suppliers/[id]/activity/[activityId]/void/route';
import { setAdminStaffTestAuth } from '@/lib/auth/adminStaffTestAuth';
import { setManagerStaffTestAuth } from '@/lib/auth/managerStaffTestAuth';
import { setReceivingStaffTestAuth } from '@/lib/auth/receivingStaffTestAuth';
import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';
import { prisma } from '@/lib/db/prisma';
import type { SupplierTimelineItem } from '@/lib/domains/suppliers/supplierActivityModel';

function scratchDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL?.trim() ?? '';
  if (!url || process.env.FRESHLOOP_DB_TESTS === '0') return null;
  try {
    const host = new URL(url).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return url;
  } catch {
    return null;
  }
  return null;
}

const hasScratchDb = Boolean(scratchDatabaseUrl());

function user(role: AuthSessionUser['role'], id: string): AuthSessionUser {
  return {
    id,
    name: role,
    email: `${id}@example.com`,
    role,
    position: 'Staff',
    hourlyRate: null,
  };
}

test('supplier activity timeline on a local scratch database', { skip: !hasScratchDb }, async (t) => {
  try {
    await prisma.$connect();
  } catch {
    t.skip('Database unreachable.');
    return;
  }

  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const supplier = await prisma.supplier.create({
    data: { name: `Activity scratch ${stamp}` },
  });
  t.after(async () => {
    setReceivingStaffTestAuth(null);
    setManagerStaffTestAuth(null);
    setAdminStaffTestAuth(null);
    await prisma.supplier.delete({ where: { id: supplier.id } }).catch(() => undefined);
  });

  const base = Date.UTC(2026, 3, 1);
  await prisma.supplierActivity.createMany({
    data: Array.from({ length: 25 }, (_, index) => ({
      supplierId: supplier.id,
      type: 'NOTE' as const,
      note: `note ${index}`,
      source: 'MANUAL' as const,
      actorId: 'seed',
      createdAt: new Date(base + index * 60_000),
    })),
  });
  await prisma.$executeRaw`
    INSERT INTO price_variance_logs (
      id, supplier_id, item_name, scanned_unit_cost, benchmark_cost, variance_pct, threshold_pct, source, created_at
    ) VALUES (
      ${`var-${stamp}`}, ${supplier.id}, 'Bananas', 4, 3, 33.3, 8, 'RECEIVING', ${new Date(base + 40 * 60_000)}
    )
  `;
  await prisma.$executeRaw`
    INSERT INTO supplier_quality_events (
      id, supplier_id, event_type, item_name, created_at
    ) VALUES (
      ${`qual-${stamp}`}, ${supplier.id}, 'ARRIVAL_SPOILAGE', 'Berries', ${new Date(base + 10 * 60_000)}
    )
  `;
  const auto = await prisma.supplierActivity.create({
    data: {
      supplierId: supplier.id,
      type: 'PRICE_CHANGE',
      source: 'AUTO',
      oldCost: 2,
      newCost: 2.4,
      actorId: null,
      createdAt: new Date(base + 50 * 60_000),
    },
  });

  const before = await prisma.supplierActivity.count({ where: { supplierId: supplier.id } });
  setReceivingStaffTestAuth(async () => user('RECEIVING_CLERK', `clerk-${stamp}`));
  const firstResponse = await GET(
    new NextRequest(`http://localhost/api/admin/suppliers/${supplier.id}/activity?filter=all`),
    { params: Promise.resolve({ id: supplier.id }) }
  );
  const first = (await firstResponse.json()) as {
    success?: boolean;
    items?: SupplierTimelineItem[];
    nextCursor?: string | null;
    openCredits?: { label: string; count: number };
  };
  assert.equal(firstResponse.status, 200);
  assert.equal(first.items?.length, 20);
  assert.equal(first.items?.[0]?.kind, 'activity');
  assert.equal(first.items?.[0]?.activityType, 'PRICE_CHANGE');
  assert.equal(first.items?.[0]?.readOnly, false);
  assert.ok(first.nextCursor);
  const afterRead = await prisma.supplierActivity.count({ where: { supplierId: supplier.id } });
  assert.equal(afterRead, before);

  const secondResponse = await GET(
    new NextRequest(
      `http://localhost/api/admin/suppliers/${supplier.id}/activity?filter=all&cursor=${encodeURIComponent(first.nextCursor ?? '')}`
    ),
    { params: Promise.resolve({ id: supplier.id }) }
  );
  const second = (await secondResponse.json()) as { items?: SupplierTimelineItem[]; nextCursor?: string | null };
  assert.equal(secondResponse.status, 200);
  const ids = [...(first.items ?? []), ...(second.items ?? [])].map((item) => `${item.kind}:${item.id}`);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, before + 2);
  assert.equal(second.nextCursor ?? null, null);

  const priceResponse = await GET(
    new NextRequest(`http://localhost/api/admin/suppliers/${supplier.id}/activity?filter=price`),
    { params: Promise.resolve({ id: supplier.id }) }
  );
  const price = (await priceResponse.json()) as { items?: SupplierTimelineItem[] };
  assert.ok(price.items?.every((item) => item.kind === 'priceVariance' || item.activityType === 'PRICE_CHANGE'));
  assert.equal(price.items?.some((item) => item.kind === 'priceVariance'), true);

  const noteResponse = await POST(
    new NextRequest(`http://localhost/api/admin/suppliers/${supplier.id}/activity`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'NOTE', note: 'Dock was late' }),
    }),
    { params: Promise.resolve({ id: supplier.id }) }
  );
  const note = (await noteResponse.json()) as { success?: boolean; item?: SupplierTimelineItem };
  assert.equal(noteResponse.status, 200);
  assert.equal(note.item?.source, 'MANUAL');
  assert.equal(note.item?.activityType, 'NOTE');

  const clerkCredit = await POST(
    new NextRequest(`http://localhost/api/admin/suppliers/${supplier.id}/activity`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'CREDIT', amount: 5, invoiceRef: 'INV-C', reason: 'SHORT' }),
    }),
    { params: Promise.resolve({ id: supplier.id }) }
  );
  assert.equal(clerkCredit.status, 403);

  setReceivingStaffTestAuth(async () => user('STORE_MANAGER', `manager-${stamp}`));
  setManagerStaffTestAuth(async () => user('STORE_MANAGER', `manager-${stamp}`));
  const creditResponse = await POST(
    new NextRequest(`http://localhost/api/admin/suppliers/${supplier.id}/activity`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'CREDIT', amount: 12.5, invoiceRef: 'INV-M', reason: 'DAMAGED' }),
    }),
    { params: Promise.resolve({ id: supplier.id }) }
  );
  const credit = (await creditResponse.json()) as { item?: SupplierTimelineItem };
  assert.equal(creditResponse.status, 200);
  assert.equal(credit.item?.creditStatus, 'OPEN');

  const openResponse = await GET(
    new NextRequest(`http://localhost/api/admin/suppliers/${supplier.id}/activity?filter=credits`),
    { params: Promise.resolve({ id: supplier.id }) }
  );
  const openBody = (await openResponse.json()) as { openCredits?: { count: number; total: number; label: string } };
  assert.equal(openBody.openCredits?.count, 1);
  assert.equal(openBody.openCredits?.total, 12.5);
  assert.equal(openBody.openCredits?.label, 'Open credits $12.50 (1)');

  const received = await PATCH(
    new NextRequest(`http://localhost/api/admin/suppliers/${supplier.id}/activity/${credit.item?.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creditStatus: 'RECEIVED' }),
    }),
    { params: Promise.resolve({ id: supplier.id, activityId: credit.item?.id ?? '' }) }
  );
  assert.equal(received.status, 200);
  const storedCredit = await prisma.supplierActivity.findUnique({ where: { id: credit.item?.id ?? '' } });
  assert.equal(storedCredit?.creditStatus, 'RECEIVED');
  assert.ok(storedCredit?.resolvedAt);

  const autoEdit = await PATCH(
    new NextRequest(`http://localhost/api/admin/suppliers/${supplier.id}/activity/${auto.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creditStatus: 'RECEIVED' }),
    }),
    { params: Promise.resolve({ id: supplier.id, activityId: auto.id }) }
  );
  assert.equal(autoEdit.status, 409);

  setAdminStaffTestAuth(async () => user('ADMIN', `admin-${stamp}`));
  const voided = await voidActivity(
    new NextRequest(`http://localhost/api/admin/suppliers/${supplier.id}/activity/${auto.id}/void`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ voidReason: 'Recorded on the wrong delivery' }),
    }),
    { params: Promise.resolve({ id: supplier.id, activityId: auto.id }) }
  );
  assert.equal(voided.status, 200);
  const storedAuto = await prisma.supplierActivity.findUnique({ where: { id: auto.id } });
  assert.ok(storedAuto);
  assert.equal(storedAuto?.voidReason, 'Recorded on the wrong delivery');
  assert.ok(storedAuto?.voidedAt);

  setAdminStaffTestAuth(async () => user('STORE_MANAGER', `manager-void-${stamp}`));
  const managerVoid = await voidActivity(
    new NextRequest(`http://localhost/api/admin/suppliers/${supplier.id}/activity/${note.item?.id}/void`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ voidReason: 'Manager cannot void' }),
    }),
    { params: Promise.resolve({ id: supplier.id, activityId: note.item?.id ?? '' }) }
  );
  assert.equal(managerVoid.status, 403);

  setAdminStaffTestAuth(async () => user('ADMIN', `admin-again-${stamp}`));
  const voidAgain = await voidActivity(
    new NextRequest(`http://localhost/api/admin/suppliers/${supplier.id}/activity/${auto.id}/void`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ voidReason: 'Already voided' }),
    }),
    { params: Promise.resolve({ id: supplier.id, activityId: auto.id }) }
  );
  assert.equal(voidAgain.status, 409);

  const heldResponse = await POST(
    new NextRequest(`http://localhost/api/admin/suppliers/${supplier.id}/activity`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'CREDIT', amount: 3, invoiceRef: 'INV-HELD', reason: 'SHORT' }),
    }),
    { params: Promise.resolve({ id: supplier.id }) }
  );
  const held = (await heldResponse.json()) as { item?: SupplierTimelineItem };
  assert.equal(heldResponse.status, 200);
  setReceivingStaffTestAuth(async () => user('ADMIN', `admin-held-${stamp}`));
  const heldVoid = await voidActivity(
    new NextRequest(`http://localhost/api/admin/suppliers/${supplier.id}/activity/${held.item?.id}/void`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ voidReason: 'Hold the credit' }),
    }),
    { params: Promise.resolve({ id: supplier.id, activityId: held.item?.id ?? '' }) }
  );
  assert.equal(heldVoid.status, 200);
  setManagerStaffTestAuth(async () => user('ADMIN', `admin-held-${stamp}`));
  const receiveVoided = await PATCH(
    new NextRequest(`http://localhost/api/admin/suppliers/${supplier.id}/activity/${held.item?.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creditStatus: 'RECEIVED' }),
    }),
    { params: Promise.resolve({ id: supplier.id, activityId: held.item?.id ?? '' }) }
  );
  assert.equal(receiveVoided.status, 409);

  const other = await prisma.supplier.create({ data: { name: `Other scratch ${stamp}` } });
  t.after(async () => {
    await prisma.supplier.delete({ where: { id: other.id } }).catch(() => undefined);
  });
  const cross = await PATCH(
    new NextRequest(`http://localhost/api/admin/suppliers/${other.id}/activity/${held.item?.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ creditStatus: 'RECEIVED' }),
    }),
    { params: Promise.resolve({ id: other.id, activityId: held.item?.id ?? '' }) }
  );
  assert.equal(cross.status, 404);
});
