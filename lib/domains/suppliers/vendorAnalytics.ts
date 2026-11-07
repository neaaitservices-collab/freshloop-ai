import { prisma } from '@/lib/domains/inventory/ledger';
import { buildSupplierScorecard } from '@/lib/domains/suppliers/scorecard';
import {
  SUPPLIER_QUALITY_EVENT,
  VENDOR_PRICE_ALERT_DEFAULT_PCT,
  type PriceVarianceAlertRow,
  type VendorAnalyticsBundle,
} from '@/lib/domains/suppliers/vendorAnalyticsTypes';

const SPOILAGE_CONDITIONS = new Set([
  'POOR',
  'DAMAGED',
  'SPOILED',
  'BRUISED',
  'OVERRIPE',
]);

function lookbackStart(days: number): Date {
  const end = new Date();
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

function vendorAnalyticsStoresReady(): boolean {
  const client = prisma as unknown as Record<string, { groupBy?: unknown } | undefined>;
  return (
    typeof client.supplierQualityEvent?.groupBy === 'function' &&
    typeof client.priceVarianceLog?.groupBy === 'function'
  );
}

function emptyScorecardsForSuppliers(
  suppliers: Array<{ id: string; name: string }>,
  lookbackDays: number,
  periodStart: Date,
  periodEnd: Date
) {
  return suppliers.map((supplier) =>
    buildSupplierScorecard({
      supplierId: supplier.id,
      supplierName: supplier.name,
      lookbackDays,
      periodStart,
      periodEnd,
      invoiceCount: 0,
      invoiceLineCount: 0,
      ocrLowConfidenceCount: 0,
      unmatchedLineCount: 0,
      notReceivedCount: 0,
      priceVarianceCount: 0,
      avgPriceVariancePct: null,
      spoilageCount: 0,
      receivingVolume: 0,
    })
  );
}

export async function getVendorAnalyticsBundle(input: {
  lookbackDays: number;
  supplierId?: string | null;
  priceAlertThresholdPct?: number;
}): Promise<VendorAnalyticsBundle> {
  const lookbackDays = Math.min(90, Math.max(7, Math.round(input.lookbackDays)));
  const thresholdPct = input.priceAlertThresholdPct ?? VENDOR_PRICE_ALERT_DEFAULT_PCT;
  const periodStart = lookbackStart(lookbackDays);
  const periodEnd = new Date();

  const suppliers = input.supplierId
    ? await prisma.supplier.findMany({ where: { id: input.supplierId } })
    : await prisma.supplier.findMany({ orderBy: { name: 'asc' } });

  if (suppliers.length === 0) {
    return {
      lookbackDays,
      priceAlertThresholdPct: thresholdPct,
      scorecards: [],
      recentPriceAlerts: [],
    };
  }

  const supplierIds = suppliers.map((s) => s.id);

  if (!vendorAnalyticsStoresReady()) {
    return {
      lookbackDays,
      priceAlertThresholdPct: thresholdPct,
      scorecards: emptyScorecardsForSuppliers(suppliers, lookbackDays, periodStart, periodEnd),
      recentPriceAlerts: [],
    };
  }

  const [
    invoiceCounts,
    qualityGroups,
    varianceGroups,
    varianceAvg,
    notReceivedGroups,
    spoilageGroups,
    recentVariances,
  ] = await Promise.all([
    prisma.vendorInvoice.groupBy({
      by: ['supplierId'],
      where: {
        supplierId: { in: supplierIds },
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      _count: { _all: true },
    }),
    prisma.supplierQualityEvent.groupBy({
      by: ['supplierId', 'eventType'],
      where: {
        supplierId: { in: supplierIds },
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      _count: { _all: true },
    }),
    prisma.priceVarianceLog.groupBy({
      by: ['supplierId'],
      where: {
        supplierId: { in: supplierIds },
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      _count: { _all: true },
    }),
    prisma.priceVarianceLog.groupBy({
      by: ['supplierId'],
      where: {
        supplierId: { in: supplierIds },
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      _avg: { variancePct: true },
    }),
    prisma.receivingDisposition.groupBy({
      by: ['supplierId'],
      where: {
        supplierId: { in: supplierIds },
        reason: 'NOT_RECEIVED',
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      _count: { _all: true },
    }),
    prisma.inventoryItem.groupBy({
      by: ['supplier'],
      where: {
        receivedDate: { gte: periodStart, lte: periodEnd },
        condition: { in: [...SPOILAGE_CONDITIONS] },
      },
      _count: { _all: true },
    }),
    prisma.priceVarianceLog.findMany({
      where: {
        supplierId: input.supplierId ? input.supplierId : { in: supplierIds },
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: { supplier: { select: { name: true } } },
    }),
  ]);

  const invoicesBySupplier = new Map(
    invoiceCounts
      .filter((row) => row.supplierId)
      .map((row) => [row.supplierId as string, row._count._all])
  );

  const invoiceIdsInWindow = await prisma.vendorInvoice.findMany({
    where: {
      supplierId: { in: supplierIds },
      createdAt: { gte: periodStart, lte: periodEnd },
    },
    select: { id: true, supplierId: true },
  });
  const linesBySupplier = new Map<string, number>();
  if (invoiceIdsInWindow.length > 0) {
    const idSet = new Set(invoiceIdsInWindow.map((i) => i.id));
    const lines = await prisma.invoiceLineItem.findMany({
      where: {
        invoiceId: { in: [...idSet] },
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      select: { invoiceId: true },
    });
    const supplierByInvoice = new Map(invoiceIdsInWindow.map((i) => [i.id, i.supplierId]));
    for (const line of lines) {
      const sid = supplierByInvoice.get(line.invoiceId);
      if (!sid) continue;
      linesBySupplier.set(sid, (linesBySupplier.get(sid) ?? 0) + 1);
    }
  }

  const qualityBySupplier = new Map<
    string,
    { low: number; unmatched: number }
  >();
  for (const row of qualityGroups) {
    const bucket = qualityBySupplier.get(row.supplierId) ?? { low: 0, unmatched: 0 };
    if (row.eventType === SUPPLIER_QUALITY_EVENT.OCR_LOW_CONFIDENCE) {
      bucket.low += row._count._all;
    }
    if (row.eventType === SUPPLIER_QUALITY_EVENT.OCR_UNMATCHED_LINE) {
      bucket.unmatched += row._count._all;
    }
    qualityBySupplier.set(row.supplierId, bucket);
  }

  const varianceCountBySupplier = new Map(
    varianceGroups.map((row) => [row.supplierId, row._count._all])
  );
  const varianceAvgBySupplier = new Map(
    varianceAvg.map((row) => [
      row.supplierId,
      row._avg.variancePct != null ? Number(row._avg.variancePct.toFixed(2)) : null,
    ])
  );
  const notReceivedBySupplier = new Map(
    notReceivedGroups
      .filter((row) => row.supplierId)
      .map((row) => [row.supplierId as string, row._count._all])
  );
  const spoilageBySupplierName = new Map(
    spoilageGroups.map((row) => [row.supplier?.toLowerCase() ?? '', row._count._all])
  );

  const scorecards = suppliers.map((supplier) => {
    const quality = qualityBySupplier.get(supplier.id) ?? { low: 0, unmatched: 0 };
    const invoiceLineCount = linesBySupplier.get(supplier.id) ?? 0;
    const receivingVolume = notReceivedBySupplier.get(supplier.id) ?? 0;

    return buildSupplierScorecard({
      supplierId: supplier.id,
      supplierName: supplier.name,
      lookbackDays,
      periodStart,
      periodEnd,
      invoiceCount: invoicesBySupplier.get(supplier.id) ?? 0,
      invoiceLineCount,
      ocrLowConfidenceCount: quality.low,
      unmatchedLineCount: quality.unmatched,
      notReceivedCount: notReceivedBySupplier.get(supplier.id) ?? 0,
      priceVarianceCount: varianceCountBySupplier.get(supplier.id) ?? 0,
      avgPriceVariancePct: varianceAvgBySupplier.get(supplier.id) ?? null,
      spoilageCount: spoilageBySupplierName.get(supplier.name.toLowerCase()) ?? 0,
      receivingVolume: invoiceLineCount + receivingVolume,
    });
  });

  scorecards.sort((a, b) => a.reliabilityScore - b.reliabilityScore);

  const recentPriceAlerts: PriceVarianceAlertRow[] = recentVariances.map((row) => ({
    id: row.id,
    supplierId: row.supplierId,
    supplierName: row.supplier.name,
    productId: row.productId,
    itemName: row.itemName,
    scannedUnitCost: row.scannedUnitCost,
    benchmarkCost: row.benchmarkCost,
    variancePct: row.variancePct,
    thresholdPct: row.thresholdPct,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  }));

  return {
    lookbackDays,
    priceAlertThresholdPct: thresholdPct,
    scorecards,
    recentPriceAlerts,
  };
}
