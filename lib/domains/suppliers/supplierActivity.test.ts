import assert from 'node:assert/strict';
import test from 'node:test';
import { runSupplierActivity, type ActivityRecord, type QualityRecord, type SupplierActivityDb, type VarianceRecord } from '@/lib/domains/suppliers/supplierActivity';
import { decodeCursor, isStrictlyOlder } from '@/lib/domains/suppliers/supplierActivityCursor';
import {
  ACTIVITY_PAGE_SIZE,
  openCreditsLabel,
  type ActivityType,
  type SupplierTimelineItem,
} from '@/lib/domains/suppliers/supplierActivityModel';
import { ROLES, type RoleName } from '@/lib/utils/roles';

const supplierId = 'sup-1';

function at(minute: number): Date {
  return new Date(Date.UTC(2026, 0, 1, 0, minute, 0, 0));
}

function activity(partial: Partial<ActivityRecord> & Pick<ActivityRecord, 'id' | 'type' | 'createdAt'>): ActivityRecord {
  return {
    supplierId,
    productId: null,
    productName: null,
    invoiceRef: null,
    amount: null,
    oldCost: null,
    newCost: null,
    qty: null,
    reason: null,
    creditStatus: null,
    resolvedAt: null,
    note: null,
    actorId: 'someone',
    source: 'MANUAL',
    voidedAt: null,
    voidReason: null,
    ...partial,
  };
}

function memoryDb(seed?: {
  activities?: ActivityRecord[];
  variances?: VarianceRecord[];
  qualities?: QualityRecord[];
  products?: string[];
}) {
  const calls: string[] = [];
  const activities = [...(seed?.activities ?? [])];
  const variances = [...(seed?.variances ?? [])];
  const qualities = [...(seed?.qualities ?? [])];
  const products = new Set(seed?.products ?? []);
  let seq = activities.length;

  const db: SupplierActivityDb = {
    async supplierExists(id) {
      calls.push('supplierExists');
      return id === supplierId;
    },
    async productExists(id) {
      calls.push('productExists');
      return products.has(id);
    },
    async listActivities({ supplierId: id, types, cursor, limit }) {
      calls.push('listActivities');
      return activities
        .filter((row) => row.supplierId === id && (types == null || types.includes(row.type)))
        .filter((row) => isStrictlyOlder({ createdAt: row.createdAt, id: row.id, kind: 'activity' }, cursor))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
        .slice(0, limit);
    },
    async listVariances({ supplierId: id, cursor, limit }) {
      calls.push('listVariances');
      return variances
        .filter(() => id === supplierId)
        .filter((row) => isStrictlyOlder({ createdAt: row.createdAt, id: row.id, kind: 'priceVariance' }, cursor))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
        .slice(0, limit);
    },
    async listQuality({ supplierId: id, cursor, limit }) {
      calls.push('listQuality');
      return qualities
        .filter(() => id === supplierId)
        .filter((row) => isStrictlyOlder({ createdAt: row.createdAt, id: row.id, kind: 'quality' }, cursor))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
        .slice(0, limit);
    },
    async openCredits(id) {
      calls.push('openCredits');
      const open = activities.filter(
        (row) =>
          row.supplierId === id &&
          row.type === 'CREDIT' &&
          row.creditStatus === 'OPEN' &&
          row.voidedAt == null
      );
      return {
        count: open.length,
        total: open.reduce((sum, row) => sum + (row.amount ?? 0), 0),
      };
    },
    async createActivity(input) {
      calls.push('create');
      seq += 1;
      const row = activity({
        id: `new-${seq}`,
        type: input.type,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        productId: input.productId,
        invoiceRef: input.invoiceRef,
        amount: input.amount,
        qty: input.qty,
        reason: input.reason,
        creditStatus: input.creditStatus,
        note: input.note,
        actorId: input.actorId,
        source: 'MANUAL',
      });
      activities.push(row);
      return row;
    },
    async findActivity(id, activityId) {
      calls.push('find');
      return activities.find((row) => row.supplierId === id && row.id === activityId) ?? null;
    },
    async updateActivity(activityId, patch) {
      calls.push('update');
      const index = activities.findIndex((row) => row.id === activityId);
      const current = activities[index];
      if (!current) throw new Error('missing activity');
      const next = { ...current };
      if (patch.creditStatus !== undefined) next.creditStatus = patch.creditStatus;
      if (patch.resolvedAt !== undefined) next.resolvedAt = patch.resolvedAt;
      if (patch.voidedAt !== undefined) next.voidedAt = patch.voidedAt;
      if (patch.voidReason !== undefined) next.voidReason = patch.voidReason;
      activities[index] = next;
      return next;
    },
  };

  return { db, calls, activities };
}

function actor(role: RoleName, id = role.toLowerCase()) {
  return { id, role };
}

function itemsOf(result: { body: Record<string, unknown> }): SupplierTimelineItem[] {
  return result.body.items as SupplierTimelineItem[];
}

test('open credits label counts dollars and rows', () => {
  assert.equal(openCreditsLabel(12.5, 2), 'Open credits $12.50 (2)');
  assert.equal(openCreditsLabel(0, 0), 'Open credits $0.00 (0)');
});

test('timeline pages newest first and does not copy price or quality logs', async () => {
  const activities = Array.from({ length: 22 }, (_, index) =>
    activity({
      id: `id-${String(index).padStart(3, '0')}`,
      type: 'NOTE',
      note: `n${index}`,
      createdAt: at(index),
    })
  );
  activities.push(
    activity({
      id: 'credit-open-a',
      type: 'CREDIT',
      amount: 10,
      creditStatus: 'OPEN',
      reason: 'SHORT',
      invoiceRef: 'A',
      createdAt: at(30),
    }),
    activity({
      id: 'credit-open-b',
      type: 'CREDIT',
      amount: 2.5,
      creditStatus: 'OPEN',
      reason: 'QUALITY',
      invoiceRef: 'B',
      createdAt: at(31),
    }),
    activity({
      id: 'credit-received',
      type: 'CREDIT',
      amount: 99,
      creditStatus: 'RECEIVED',
      reason: 'PRICING',
      createdAt: at(32),
    }),
    activity({
      id: 'credit-void',
      type: 'CREDIT',
      amount: 50,
      creditStatus: 'OPEN',
      reason: 'OTHER',
      voidedAt: at(1),
      voidReason: 'Entered twice',
      createdAt: at(33),
    })
  );
  const { db, calls, activities: rows } = memoryDb({
    activities,
    variances: [
      {
        id: 'var-1',
        itemName: 'Bananas',
        scannedUnitCost: 4,
        benchmarkCost: 3,
        variancePct: 33.3,
        createdAt: at(40),
      },
    ],
    qualities: [
      {
        id: 'qual-1',
        eventType: 'ARRIVAL_SPOILAGE',
        itemName: 'Berries',
        createdAt: at(5),
      },
    ],
  });
  const before = rows.length;
  const first = await runSupplierActivity({
    actor: actor('STORE_MANAGER'),
    supplierId,
    action: 'list',
    filter: 'all',
    db,
  });
  assert.equal(first.status, 200);
  assert.equal(rows.length, before);
  assert.equal(calls.includes('create'), false);
  const page = itemsOf(first);
  assert.equal(page.length, ACTIVITY_PAGE_SIZE);
  assert.equal(page[0]?.kind, 'priceVariance');
  assert.equal(page[0]?.readOnly, true);
  assert.equal(page[0]?.title, 'Price variance');
  const credits = first.body.openCredits as { total: number; count: number; label: string };
  assert.equal(credits.count, 2);
  assert.equal(credits.total, 12.5);
  assert.equal(credits.label, 'Open credits $12.50 (2)');
  const cursor = first.body.nextCursor as string;
  assert.ok(cursor);
  const second = await runSupplierActivity({
    actor: actor('RECEIVING_CLERK'),
    supplierId,
    action: 'list',
    filter: 'all',
    cursor,
    db,
  });
  const rest = itemsOf(second);
  const seen = new Set([...page, ...rest].map((item) => `${item.kind}:${item.id}`));
  assert.equal(seen.size, page.length + rest.length);
  assert.equal(second.body.nextCursor, null);
  const times = [...page, ...rest].map((item) => item.createdAt);
  const sorted = [...times].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  assert.deepEqual(times, sorted);

  const price = await runSupplierActivity({
    actor: actor('ADMIN'),
    supplierId,
    action: 'list',
    filter: 'price',
    db,
  });
  assert.deepEqual(
    itemsOf(price).map((item) => item.kind),
    ['priceVariance']
  );
  const alerts = await runSupplierActivity({
    actor: actor('ADMIN'),
    supplierId,
    action: 'list',
    filter: 'alerts',
    db,
  });
  assert.deepEqual(
    itemsOf(alerts).map((item) => item.id),
    ['qual-1']
  );
  const onlyCredits = await runSupplierActivity({
    actor: actor('ADMIN'),
    supplierId,
    action: 'list',
    filter: 'credits',
    db,
  });
  assert.ok(itemsOf(onlyCredits).every((item) => item.activityType === 'CREDIT'));
  assert.equal(itemsOf(onlyCredits).some((item) => item.id === 'var-1'), false);
});

test('manual add, receive, and void follow the role rules and never delete', async () => {
  const auto = activity({
    id: 'auto-price',
    type: 'PRICE_CHANGE',
    source: 'AUTO',
    oldCost: 2,
    newCost: 3,
    productName: 'Milk',
    createdAt: at(1),
  });
  const { db, calls, activities } = memoryDb({ activities: [auto] });

  for (const role of ROLES) {
    calls.length = 0;
    const note = await runSupplierActivity({
      actor: actor(role, `user-${role}`),
      supplierId,
      action: 'add',
      body: { type: 'NOTE', note: 'Late truck' },
      db,
    });
    const countBeforeCredit = activities.length;
    const credit = await runSupplierActivity({
      actor: actor(role, `user-${role}`),
      supplierId,
      action: 'add',
      body: { type: 'CREDIT', amount: 8, invoiceRef: 'INV-9', reason: 'DAMAGED', note: 'Crushed' },
      db,
    });
    const received = await runSupplierActivity({
      actor: actor(role, `user-${role}`),
      supplierId,
      action: 'receive',
      activityId: 'missing',
      body: { creditStatus: 'RECEIVED' },
      db,
    });
    const voidedAtBefore = activities.find((row) => row.id === 'auto-price')?.voidedAt ?? null;
    const voided = await runSupplierActivity({
      actor: actor(role, `user-${role}`),
      supplierId,
      action: 'void',
      activityId: 'auto-price',
      body: { voidReason: 'Wrong supplier' },
      db,
    });

    if (role === 'FLOOR_STAFF' || role === 'DELI_CHEF') {
      assert.equal(note.status, 403, role);
      assert.equal(credit.status, 403, role);
      assert.equal(received.status, 403, role);
      assert.equal(voided.status, 403, role);
      assert.deepEqual(calls, [], role);
      continue;
    }

    assert.equal(note.status, 200, role);
    const saved = note.body.item as SupplierTimelineItem;
    assert.equal(saved.source, 'MANUAL');
    assert.equal(activities.find((row) => row.id === saved.id)?.actorId, `user-${role}`);

    if (role === 'RECEIVING_CLERK') {
      assert.equal(credit.status, 403, role);
      assert.equal(activities.length, countBeforeCredit);
      assert.equal(received.status, 403, role);
      assert.equal(voided.status, 403, role);
    } else {
      assert.equal(credit.status, 200, role);
      const creditItem = credit.body.item as SupplierTimelineItem;
      assert.equal(creditItem.creditStatus, 'OPEN');
      assert.equal(creditItem.source, 'MANUAL');
      const marked = await runSupplierActivity({
        actor: actor(role, `user-${role}`),
        supplierId,
        action: 'receive',
        activityId: creditItem.id,
        body: { creditStatus: 'RECEIVED' },
        now: at(90),
        db,
      });
      assert.equal(marked.status, 200, role);
      assert.equal((marked.body.item as SupplierTimelineItem).creditStatus, 'RECEIVED');
      assert.equal(activities.find((row) => row.id === creditItem.id)?.resolvedAt?.toISOString(), at(90).toISOString());
    }

    if (role === 'ADMIN') {
      assert.equal(voided.status, 200);
      assert.equal((voided.body.item as SupplierTimelineItem).voidReason, 'Wrong supplier');
      assert.equal(activities.find((row) => row.id === 'auto-price')?.source, 'AUTO');
      const again = await runSupplierActivity({
        actor: actor('ADMIN'),
        supplierId,
        action: 'void',
        activityId: 'auto-price',
        body: { voidReason: 'Again' },
        db,
      });
      assert.equal(again.status, 400);
    } else {
      assert.equal(voided.status, 403, role);
      assert.equal(activities.find((row) => row.id === 'auto-price')?.voidedAt ?? null, voidedAtBefore);
    }
  }

  const edited = await runSupplierActivity({
    actor: actor('ADMIN'),
    supplierId,
    action: 'receive',
    activityId: 'auto-price',
    body: { creditStatus: 'RECEIVED' },
    db,
  });
  assert.equal(edited.status, 400);
  assert.match(String(edited.body.error), /Automatic rows/);
  assert.equal(activities.find((row) => row.id === 'auto-price')?.creditStatus, null);

  const handPrice = await runSupplierActivity({
    actor: actor('STORE_MANAGER'),
    supplierId,
    action: 'add',
    body: { type: 'PRICE_CHANGE', oldCost: 1, newCost: 2 },
    db,
  });
  assert.equal(handPrice.status, 400);
  assert.equal(
    activities.filter((row) => row.type === 'PRICE_CHANGE').length,
    1
  );
});

test('manual activity fields are validated per type', async () => {
  const productId = '11111111-1111-4111-8111-111111111111';
  const { db, activities } = memoryDb({ products: [productId] });
  const cases: Array<{ body: unknown; status: number }> = [
    { body: { type: 'NOTE', note: '   ' }, status: 400 },
    { body: { type: 'NOTE', note: 'Keep the invoice' }, status: 200 },
    { body: { type: 'CREDIT', amount: 0, invoiceRef: 'INV', reason: 'SHORT' }, status: 400 },
    { body: { type: 'CREDIT', amount: 4, invoiceRef: '   ', reason: 'SHORT' }, status: 400 },
    { body: { type: 'CREDIT', amount: 4, invoiceRef: 'INV-2', reason: 'NOPE' }, status: 400 },
    { body: { type: 'SHORT_SHIP', productId: 'not-a-uuid', qty: 2 }, status: 400 },
    { body: { type: 'SHORT_SHIP', productId, qty: 2, invoiceRef: 'INV-3' }, status: 200 },
    { body: { type: 'QUALITY_REJECT', productId: '22222222-2222-4222-8222-222222222222' }, status: 400 },
    { body: { type: 'LATE_DELIVERY' }, status: 200 },
    { body: { type: 'NOPE' }, status: 400 },
  ];
  for (const [index, entry] of cases.entries()) {
    const result = await runSupplierActivity({
      actor: actor('ADMIN', `admin-${index}`),
      supplierId,
      action: 'add',
      body: entry.body,
      db,
    });
    assert.equal(result.status, entry.status, JSON.stringify(entry.body));
  }
  const short = activities.find((row) => row.type === 'SHORT_SHIP');
  assert.equal(short?.productId, productId);
  assert.equal(short?.qty, 2);
  assert.equal(short?.source, 'MANUAL');
  const late = activities.find((row) => row.type === 'LATE_DELIVERY');
  assert.ok(late);
  assert.equal(
    (await runSupplierActivity({
      actor: actor('STORE_MANAGER'),
      supplierId,
      action: 'receive',
      activityId: late?.id,
      body: { creditStatus: 'RECEIVED' },
      db,
    })).status,
    400
  );
});

test('a bad cursor or unknown supplier does not write a row', async () => {
  const { db, calls, activities } = memoryDb();
  const cursor = await runSupplierActivity({
    actor: actor('RECEIVING_CLERK'),
    supplierId,
    action: 'list',
    cursor: 'not-a-cursor',
    db,
  });
  assert.equal(cursor.status, 400);
  assert.equal(decodeCursor('not-a-cursor'), 'invalid');
  assert.deepEqual(calls, []);
  const missing = await runSupplierActivity({
    actor: actor('ADMIN'),
    supplierId: 'missing-supplier',
    action: 'list',
    db,
  });
  assert.equal(missing.status, 404);
  assert.equal(activities.length, 0);
  const badType = 'DELETE' as ActivityType;
  assert.equal(badType === 'NOTE', false);
});
