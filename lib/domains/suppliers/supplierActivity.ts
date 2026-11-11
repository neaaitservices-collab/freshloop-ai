import type { RoleName } from '@/lib/utils/roles';
import {
  parseManualActivity,
  parseVoidReason,
  receiveCreditSchema,
  type ManualActivityInput,
} from '@/lib/security/schemas/supplierActivity';
import {
  compareTimeline,
  decodeCursor,
  encodeCursor,
  isStrictlyOlder,
  type TimelineCursor,
} from '@/lib/domains/suppliers/supplierActivityCursor';
import {
  ACTIVITY_PAGE_SIZE,
  ACTIVITY_TYPE_LABELS,
  CREDIT_REASON_LABELS,
  canReceiveCredit,
  canViewSupplierActivity,
  canVoidActivity,
  isSafeRecordId,
  manualActivityTypesForRole,
  openCreditsLabel,
  parseActivityFilter,
  type ActivityFilter,
  type ActivityType,
  type CreditReason,
  type SupplierTimelineItem,
  type TimelineKind,
} from '@/lib/domains/suppliers/supplierActivityModel';

const FETCH_LIMIT = ACTIVITY_PAGE_SIZE + 1;

const ALERT_TYPES: ActivityType[] = ['SHORT_SHIP', 'QUALITY_REJECT', 'LATE_DELIVERY'];

const QUALITY_TITLES: Record<string, string> = {
  OCR_LOW_CONFIDENCE: 'Low scan confidence',
  OCR_UNMATCHED_LINE: 'Unmatched invoice line',
  NOT_RECEIVED: 'Not received',
  PRICE_VARIANCE: 'Price variance flag',
  ARRIVAL_SPOILAGE: 'Arrival spoilage',
};

export type ActivityRecord = {
  id: string;
  supplierId: string;
  type: ActivityType;
  productId: string | null;
  productName: string | null;
  invoiceRef: string | null;
  amount: number | null;
  oldCost: number | null;
  newCost: number | null;
  qty: number | null;
  reason: CreditReason | null;
  creditStatus: 'OPEN' | 'RECEIVED' | null;
  resolvedAt: Date | null;
  note: string | null;
  actorId: string | null;
  source: 'AUTO' | 'MANUAL';
  voidedAt: Date | null;
  voidReason: string | null;
  createdAt: Date;
};

export type VarianceRecord = {
  id: string;
  itemName: string;
  scannedUnitCost: number;
  benchmarkCost: number;
  variancePct: number;
  createdAt: Date;
};

export type QualityRecord = {
  id: string;
  eventType: string;
  itemName: string | null;
  createdAt: Date;
};

export type ActivityWrite = {
  supplierId: string;
  type: ActivityType;
  productId: string | null;
  invoiceRef: string | null;
  amount: number | null;
  qty: number | null;
  reason: CreditReason | null;
  creditStatus: 'OPEN' | 'RECEIVED' | null;
  note: string | null;
  actorId: string;
  source: 'MANUAL';
};

export interface SupplierActivityDb {
  supplierExists(supplierId: string): Promise<boolean>;
  productExists(productId: string): Promise<boolean>;
  listActivities(input: {
    supplierId: string;
    types: ActivityType[] | null;
    cursor: TimelineCursor | null;
    limit: number;
  }): Promise<ActivityRecord[]>;
  listVariances(input: {
    supplierId: string;
    cursor: TimelineCursor | null;
    limit: number;
  }): Promise<VarianceRecord[]>;
  listQuality(input: {
    supplierId: string;
    cursor: TimelineCursor | null;
    limit: number;
  }): Promise<QualityRecord[]>;
  openCredits(supplierId: string): Promise<{ total: number; count: number }>;
  createActivity(input: ActivityWrite): Promise<ActivityRecord>;
  findActivity(supplierId: string, activityId: string): Promise<ActivityRecord | null>;
  updateActivity(
    activityId: string,
    patch: Partial<Pick<ActivityRecord, 'creditStatus' | 'resolvedAt' | 'voidedAt' | 'voidReason'>>
  ): Promise<ActivityRecord>;
}

export type SupplierActivityResult = {
  status: number;
  body: Record<string, unknown>;
};

type Actor = { id: string; role: RoleName };

function fail(status: number, error: string): SupplierActivityResult {
  return { status, body: { success: false, error } };
}

const forbidden = () => fail(403, 'Forbidden — your role cannot perform this action.');

function money(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function joinDetail(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(' · ');
}

function changePct(oldCost: number | null, newCost: number | null): string | null {
  if (oldCost == null || newCost == null || oldCost === 0) return null;
  const pct = ((newCost - oldCost) / oldCost) * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

export function presentActivity(row: ActivityRecord): SupplierTimelineItem {
  const costs =
    row.type === 'PRICE_CHANGE'
      ? joinDetail([
          row.productName,
          money(row.oldCost) && money(row.newCost) ? `${money(row.oldCost)} → ${money(row.newCost)}` : null,
          changePct(row.oldCost, row.newCost),
        ])
      : null;
  const detail = joinDetail([
    costs,
    row.type === 'CREDIT' ? money(row.amount) : null,
    row.reason ? CREDIT_REASON_LABELS[row.reason] : null,
    row.creditStatus === 'OPEN' ? 'Open' : row.creditStatus === 'RECEIVED' ? 'Received' : null,
    row.productName && row.type !== 'PRICE_CHANGE' ? row.productName : null,
    row.qty != null ? `Qty ${row.qty}` : null,
    row.invoiceRef ? `Invoice ${row.invoiceRef}` : null,
    row.note,
  ]);
  return {
    id: row.id,
    kind: 'activity',
    readOnly: false,
    createdAt: row.createdAt.toISOString(),
    title: ACTIVITY_TYPE_LABELS[row.type],
    detail,
    activityType: row.type,
    source: row.source,
    creditStatus: row.creditStatus,
    amount: row.amount,
    voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
    voidReason: row.voidReason,
  };
}

export function presentVariance(row: VarianceRecord): SupplierTimelineItem {
  const pct = Number.isFinite(row.variancePct) ? `${row.variancePct.toFixed(1)}%` : null;
  return {
    id: row.id,
    kind: 'priceVariance',
    readOnly: true,
    createdAt: row.createdAt.toISOString(),
    title: 'Price variance',
    detail: joinDetail([
      row.itemName,
      money(row.scannedUnitCost) && money(row.benchmarkCost)
        ? `${money(row.scannedUnitCost)} vs ${money(row.benchmarkCost)}`
        : null,
      pct,
    ]),
    activityType: null,
    source: null,
    creditStatus: null,
    amount: null,
    voidedAt: null,
    voidReason: null,
  };
}

export function presentQuality(row: QualityRecord): SupplierTimelineItem {
  return {
    id: row.id,
    kind: 'quality',
    readOnly: true,
    createdAt: row.createdAt.toISOString(),
    title: QUALITY_TITLES[row.eventType] ?? row.eventType.replaceAll('_', ' '),
    detail: row.itemName?.trim() || 'Read only',
    activityType: null,
    source: null,
    creditStatus: null,
    amount: null,
    voidedAt: null,
    voidReason: null,
  };
}

function typesForFilter(filter: ActivityFilter): ActivityType[] | null {
  if (filter === 'price') return ['PRICE_CHANGE'];
  if (filter === 'credits') return ['CREDIT'];
  if (filter === 'alerts') return ALERT_TYPES;
  return null;
}

function pageItems(items: SupplierTimelineItem[]): {
  items: SupplierTimelineItem[];
  nextCursor: string | null;
} {
  const sorted = [...items].sort(compareTimeline);
  const page = sorted.slice(0, ACTIVITY_PAGE_SIZE);
  const last = page[page.length - 1];
  const nextCursor =
    sorted.length > ACTIVITY_PAGE_SIZE && last
      ? encodeCursor({ at: last.createdAt, kind: last.kind, id: last.id })
      : null;
  return { items: page, nextCursor };
}

function writeFromInput(supplierId: string, actorId: string, input: ManualActivityInput): ActivityWrite {
  if (input.type === 'NOTE') {
    return {
      supplierId,
      type: 'NOTE',
      productId: null,
      invoiceRef: null,
      amount: null,
      qty: null,
      reason: null,
      creditStatus: null,
      note: input.note,
      actorId,
      source: 'MANUAL',
    };
  }
  if (input.type === 'LATE_DELIVERY') {
    return {
      supplierId,
      type: 'LATE_DELIVERY',
      productId: null,
      invoiceRef: input.invoiceRef,
      amount: null,
      qty: null,
      reason: null,
      creditStatus: null,
      note: input.note,
      actorId,
      source: 'MANUAL',
    };
  }
  if (input.type === 'CREDIT') {
    return {
      supplierId,
      type: 'CREDIT',
      productId: null,
      invoiceRef: input.invoiceRef,
      amount: input.amount,
      qty: null,
      reason: input.reason,
      creditStatus: 'OPEN',
      note: input.note,
      actorId,
      source: 'MANUAL',
    };
  }
  return {
    supplierId,
    type: input.type,
    productId: input.productId,
    invoiceRef: input.invoiceRef,
    amount: null,
    qty: input.qty,
    reason: null,
    creditStatus: null,
    note: input.note,
    actorId,
    source: 'MANUAL',
  };
}

async function listTimeline(
  db: SupplierActivityDb,
  supplierId: string,
  filter: ActivityFilter,
  cursor: TimelineCursor | null
): Promise<SupplierActivityResult> {
  const includeVariance = filter === 'all' || filter === 'price';
  const includeQuality = filter === 'all' || filter === 'alerts';
  const [activities, variances, qualities, credits] = await Promise.all([
    db.listActivities({
      supplierId,
      types: typesForFilter(filter),
      cursor,
      limit: FETCH_LIMIT,
    }),
    includeVariance ? db.listVariances({ supplierId, cursor, limit: FETCH_LIMIT }) : Promise.resolve([]),
    includeQuality ? db.listQuality({ supplierId, cursor, limit: FETCH_LIMIT }) : Promise.resolve([]),
    db.openCredits(supplierId),
  ]);
  const older = (createdAt: Date, id: string, kind: TimelineKind) =>
    isStrictlyOlder({ createdAt, id, kind }, cursor);
  const merged = [
    ...activities.filter((row) => older(row.createdAt, row.id, 'activity')).map(presentActivity),
    ...variances.filter((row) => older(row.createdAt, row.id, 'priceVariance')).map(presentVariance),
    ...qualities.filter((row) => older(row.createdAt, row.id, 'quality')).map(presentQuality),
  ];
  const page = pageItems(merged);
  return {
    status: 200,
    body: {
      success: true,
      filter,
      openCredits: {
        total: credits.total,
        count: credits.count,
        label: openCreditsLabel(credits.total, credits.count),
      },
      items: page.items,
      nextCursor: page.nextCursor,
    },
  };
}

export async function runSupplierActivity(input: {
  actor: Actor;
  supplierId: string;
  action: 'list' | 'add' | 'receive' | 'void';
  filter?: string | null;
  cursor?: string | null;
  body?: unknown;
  activityId?: string;
  db: SupplierActivityDb;
  now?: Date;
}): Promise<SupplierActivityResult> {
  if (!canViewSupplierActivity(input.actor.role)) return forbidden();

  if (input.action === 'add') {
    const parsed = parseManualActivity(input.body);
    if (!parsed.ok) return fail(400, parsed.error);
    if (!manualActivityTypesForRole(input.actor.role).includes(parsed.value.type)) return forbidden();
  } else if (input.action === 'receive') {
    if (!canReceiveCredit(input.actor.role)) return forbidden();
    const parsed = receiveCreditSchema.safeParse(input.body);
    if (!parsed.success) return fail(400, 'Credit status must be RECEIVED.');
  } else if (input.action === 'void') {
    if (!canVoidActivity(input.actor.role)) return forbidden();
    const parsed = parseVoidReason(input.body);
    if (!parsed.ok) return fail(400, parsed.error);
  }

  if (!isSafeRecordId(input.supplierId)) return fail(400, 'Supplier id is invalid.');
  const filter = parseActivityFilter(input.filter);
  if (input.action === 'list' && !filter) return fail(400, 'Activity filter is invalid.');
  const cursor = decodeCursor(input.cursor);
  if (cursor === 'invalid') return fail(400, 'Cursor is invalid.');

  const activityId = input.activityId?.trim() ?? '';
  if ((input.action === 'receive' || input.action === 'void') && !isSafeRecordId(activityId)) {
    return fail(400, 'Activity id is invalid.');
  }

  if (!(await input.db.supplierExists(input.supplierId))) {
    return fail(404, 'Supplier was not found.');
  }

  if (input.action === 'list' && filter) {
    return listTimeline(input.db, input.supplierId, filter, cursor);
  }

  if (input.action === 'add') {
    const parsed = parseManualActivity(input.body);
    if (!parsed.ok) return fail(400, parsed.error);
    if (parsed.value.type === 'SHORT_SHIP' || parsed.value.type === 'QUALITY_REJECT') {
      if (parsed.value.productId && !(await input.db.productExists(parsed.value.productId))) {
        return fail(400, 'Product was not found.');
      }
    }
    const saved = await input.db.createActivity(
      writeFromInput(input.supplierId, input.actor.id, parsed.value)
    );
    if (saved.source !== 'MANUAL' || saved.actorId !== input.actor.id) {
      return fail(500, 'Activity could not be saved.');
    }
    return { status: 200, body: { success: true, item: presentActivity(saved) } };
  }

  const existing = await input.db.findActivity(input.supplierId, activityId);
  if (!existing) return fail(404, 'Activity was not found.');

  if (input.action === 'receive') {
    if (existing.source === 'AUTO') return fail(400, "Automatic rows can't be edited.");
    if (existing.type !== 'CREDIT') return fail(400, 'Only a credit can be marked received.');
    if (existing.voidedAt) return fail(400, 'Voided credits cannot be marked received.');
    if (existing.creditStatus === 'RECEIVED') {
      return { status: 200, body: { success: true, item: presentActivity(existing) } };
    }
    const saved = await input.db.updateActivity(existing.id, {
      creditStatus: 'RECEIVED',
      resolvedAt: input.now ?? new Date(),
    });
    return { status: 200, body: { success: true, item: presentActivity(saved) } };
  }

  const reason = parseVoidReason(input.body);
  if (!reason.ok) return fail(400, reason.error);
  if (existing.voidedAt) return fail(400, 'This row is already voided.');
  const saved = await input.db.updateActivity(existing.id, {
    voidedAt: input.now ?? new Date(),
    voidReason: reason.voidReason,
  });
  return { status: 200, body: { success: true, item: presentActivity(saved) } };
}
