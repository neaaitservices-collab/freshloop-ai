import { Prisma } from '@prisma/client';
import type {
  SupplierActivitySource,
  SupplierActivityType,
  SupplierCreditReason,
  SupplierCreditStatus,
} from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { kindRank, type TimelineCursor } from '@/lib/domains/suppliers/supplierActivityCursor';
import type {
  ActivityRecord,
  ActivityWrite,
  QualityRecord,
  SupplierActivityDb,
  VarianceRecord,
} from '@/lib/domains/suppliers/supplierActivity';
import type { ActivityType, CreditReason, TimelineKind } from '@/lib/domains/suppliers/supplierActivityModel';

const activityInclude = {
  product: { select: { name: true } },
} satisfies Prisma.SupplierActivityInclude;

type ActivityRow = Prisma.SupplierActivityGetPayload<{ include: typeof activityInclude }>;

function cursorWhere(kind: TimelineKind, cursor: TimelineCursor | null) {
  if (!cursor) return {};
  const at = new Date(cursor.at);
  const rank = kindRank(kind);
  const cursorRank = kindRank(cursor.kind);
  if (rank > cursorRank) return { createdAt: { lt: at } };
  if (rank < cursorRank) return { createdAt: { lte: at } };
  return {
    OR: [{ createdAt: { lt: at } }, { AND: [{ createdAt: at }, { id: { lt: cursor.id } }] }],
  };
}

function mapActivity(row: ActivityRow): ActivityRecord {
  return {
    id: row.id,
    supplierId: row.supplierId,
    type: row.type as ActivityType,
    productId: row.productId,
    productName: row.product?.name ?? null,
    invoiceRef: row.invoiceRef,
    amount: row.amount,
    oldCost: row.oldCost,
    newCost: row.newCost,
    qty: row.qty,
    reason: (row.reason as CreditReason | null) ?? null,
    creditStatus: row.creditStatus,
    resolvedAt: row.resolvedAt,
    note: row.note,
    actorId: row.actorId,
    source: row.source,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    createdAt: row.createdAt,
  };
}

type VarianceSqlRow = {
  id: string;
  item_name: string;
  scanned_unit_cost: number;
  benchmark_cost: number;
  variance_pct: number;
  created_at: Date | string;
};

type QualitySqlRow = {
  id: string;
  event_type: string;
  item_name: string | null;
  created_at: Date | string;
};

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

async function readVarianceRows(
  supplierId: string,
  cursor: TimelineCursor | null,
  limit: number
): Promise<VarianceRecord[]> {
  const at = cursor ? new Date(cursor.at) : null;
  const rank = kindRank('priceVariance');
  const cursorRank = cursor ? kindRank(cursor.kind) : rank;
  const rows = !cursor || !at
    ? await prisma.$queryRaw<VarianceSqlRow[]>`
        SELECT id, item_name, scanned_unit_cost, benchmark_cost, variance_pct, created_at
        FROM price_variance_logs
        WHERE supplier_id = ${supplierId}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit}
      `
    : rank > cursorRank
      ? await prisma.$queryRaw<VarianceSqlRow[]>`
          SELECT id, item_name, scanned_unit_cost, benchmark_cost, variance_pct, created_at
          FROM price_variance_logs
          WHERE supplier_id = ${supplierId} AND created_at < ${at}
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit}
        `
      : rank < cursorRank
        ? await prisma.$queryRaw<VarianceSqlRow[]>`
            SELECT id, item_name, scanned_unit_cost, benchmark_cost, variance_pct, created_at
            FROM price_variance_logs
            WHERE supplier_id = ${supplierId} AND created_at <= ${at}
            ORDER BY created_at DESC, id DESC
            LIMIT ${limit}
          `
        : await prisma.$queryRaw<VarianceSqlRow[]>`
            SELECT id, item_name, scanned_unit_cost, benchmark_cost, variance_pct, created_at
            FROM price_variance_logs
            WHERE supplier_id = ${supplierId}
              AND (created_at < ${at} OR (created_at = ${at} AND id < ${cursor.id}))
            ORDER BY created_at DESC, id DESC
            LIMIT ${limit}
          `;
  return rows.map((row) => ({
    id: row.id,
    itemName: row.item_name,
    scannedUnitCost: Number(row.scanned_unit_cost),
    benchmarkCost: Number(row.benchmark_cost),
    variancePct: Number(row.variance_pct),
    createdAt: asDate(row.created_at),
  }));
}

async function readQualityRows(
  supplierId: string,
  cursor: TimelineCursor | null,
  limit: number
): Promise<QualityRecord[]> {
  const at = cursor ? new Date(cursor.at) : null;
  const rank = kindRank('quality');
  const cursorRank = cursor ? kindRank(cursor.kind) : rank;
  const rows = !cursor || !at
    ? await prisma.$queryRaw<QualitySqlRow[]>`
        SELECT id, event_type, item_name, created_at
        FROM supplier_quality_events
        WHERE supplier_id = ${supplierId}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit}
      `
    : rank > cursorRank
      ? await prisma.$queryRaw<QualitySqlRow[]>`
          SELECT id, event_type, item_name, created_at
          FROM supplier_quality_events
          WHERE supplier_id = ${supplierId} AND created_at < ${at}
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit}
        `
      : rank < cursorRank
        ? await prisma.$queryRaw<QualitySqlRow[]>`
            SELECT id, event_type, item_name, created_at
            FROM supplier_quality_events
            WHERE supplier_id = ${supplierId} AND created_at <= ${at}
            ORDER BY created_at DESC, id DESC
            LIMIT ${limit}
          `
        : await prisma.$queryRaw<QualitySqlRow[]>`
            SELECT id, event_type, item_name, created_at
            FROM supplier_quality_events
            WHERE supplier_id = ${supplierId}
              AND (created_at < ${at} OR (created_at = ${at} AND id < ${cursor.id}))
            ORDER BY created_at DESC, id DESC
            LIMIT ${limit}
          `;
  return rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    itemName: row.item_name,
    createdAt: asDate(row.created_at),
  }));
}

async function exists(lookup: Promise<{ id: string } | null>): Promise<boolean> {
  try {
    return Boolean(await lookup);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientValidationError) return false;
    throw error;
  }
}

export const supplierActivityDb: SupplierActivityDb = {
  supplierExists(supplierId) {
    return exists(prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true } }));
  },
  productExists(productId) {
    return exists(prisma.product.findUnique({ where: { id: productId }, select: { id: true } }));
  },
  async listActivities({ supplierId, types, cursor, limit }) {
    const rows = await prisma.supplierActivity.findMany({
      where: {
        supplierId,
        ...(types ? { type: { in: types as SupplierActivityType[] } } : {}),
        ...cursorWhere('activity', cursor),
      },
      include: activityInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map(mapActivity);
  },
  listVariances({ supplierId, cursor, limit }) {
    return readVarianceRows(supplierId, cursor, limit);
  },
  listQuality({ supplierId, cursor, limit }) {
    return readQualityRows(supplierId, cursor, limit);
  },
  async openCredits(supplierId) {
    const agg = await prisma.supplierActivity.aggregate({
      where: {
        supplierId,
        type: 'CREDIT',
        creditStatus: 'OPEN',
        voidedAt: null,
      },
      _sum: { amount: true },
      _count: { _all: true },
    });
    return { total: agg._sum.amount ?? 0, count: agg._count._all };
  },
  async createActivity(input: ActivityWrite) {
    const row = await prisma.supplierActivity.create({
      data: {
        supplierId: input.supplierId,
        type: input.type as SupplierActivityType,
        productId: input.productId,
        invoiceRef: input.invoiceRef,
        amount: input.amount,
        qty: input.qty,
        reason: input.reason as SupplierCreditReason | null,
        creditStatus: input.creditStatus as SupplierCreditStatus | null,
        note: input.note,
        actorId: input.actorId,
        source: 'MANUAL' satisfies SupplierActivitySource,
      },
      include: activityInclude,
    });
    return mapActivity(row);
  },
  async findActivity(supplierId, activityId) {
    const row = await prisma.supplierActivity.findFirst({
      where: { id: activityId, supplierId },
      include: activityInclude,
    });
    return row ? mapActivity(row) : null;
  },
  async receiveCredit({ supplierId, activityId, resolvedAt }) {
    const updated = await prisma.supplierActivity.updateMany({
      where: {
        id: activityId,
        supplierId,
        type: 'CREDIT',
        source: 'MANUAL',
        voidedAt: null,
        creditStatus: 'OPEN',
      },
      data: { creditStatus: 'RECEIVED', resolvedAt },
    });
    return finishConditionalUpdate(supplierId, activityId, updated.count);
  },
  async voidActivity({ supplierId, activityId, voidedAt, voidReason }) {
    const updated = await prisma.supplierActivity.updateMany({
      where: { id: activityId, supplierId, voidedAt: null },
      data: { voidedAt, voidReason },
    });
    return finishConditionalUpdate(supplierId, activityId, updated.count);
  },
};

async function finishConditionalUpdate(
  supplierId: string,
  activityId: string,
  count: number
): Promise<
  | { outcome: 'updated'; row: ActivityRecord }
  | { outcome: 'missing' }
  | { outcome: 'conflict' }
> {
  if (count > 0) {
    const row = await prisma.supplierActivity.findFirst({
      where: { id: activityId, supplierId },
      include: activityInclude,
    });
    if (!row) return { outcome: 'missing' };
    return { outcome: 'updated', row: mapActivity(row) };
  }
  const owned = await prisma.supplierActivity.findFirst({
    where: { id: activityId, supplierId },
    select: { id: true },
  });
  return owned ? { outcome: 'conflict' } : { outcome: 'missing' };
}
