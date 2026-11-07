import { prisma } from '@/lib/domains/inventory/ledger';
import {
  SUPPLIER_QUALITY_EVENT,
  type PriceVarianceSource,
} from '@/lib/domains/suppliers/vendorAnalyticsTypes';
import {
  buildPriceVarianceDraft,
  type PriceVarianceDraft,
} from '@/lib/domains/suppliers/priceVariance';

export async function persistPriceVarianceDrafts(rows: PriceVarianceDraft[]): Promise<number> {
  if (rows.length === 0) return 0;
  const data = rows.map((row) => ({
    supplierId: row.supplierId,
    productId: row.productId,
    vendorInvoiceId: row.vendorInvoiceId,
    itemName: row.itemName,
    scannedUnitCost: row.scannedUnitCost,
    benchmarkCost: row.benchmarkCost,
    variancePct: row.variancePct,
    thresholdPct: row.thresholdPct,
    source: row.source,
  }));
  const created = await prisma.priceVarianceLog.createMany({ data });
  for (const row of rows) {
    await prisma.supplierQualityEvent.create({
      data: {
        supplierId: row.supplierId,
        eventType: SUPPLIER_QUALITY_EVENT.PRICE_VARIANCE,
        productId: row.productId,
        vendorInvoiceId: row.vendorInvoiceId,
        itemName: row.itemName,
        metadata: {
          variancePct: row.variancePct,
          thresholdPct: row.thresholdPct,
          source: row.source,
        },
      },
    });
  }
  return created.count;
}

export async function recordOcrScanAnalytics(input: {
  supplierId: string;
  vendorInvoiceId?: string | null;
  lines: Array<{
    item_name: string;
    product_id: string | null;
    unit_cost: number;
    historical_avg_cost: number | null;
    cost_variance_pct: number | null;
    line_confidence?: number | null;
    needs_manual_review?: boolean;
  }>;
  analyticsThresholdPct: number;
}): Promise<void> {
  const drafts: PriceVarianceDraft[] = [];
  for (const line of input.lines) {
    if (line.historical_avg_cost != null && line.historical_avg_cost > 0) {
      const draft =
        buildPriceVarianceDraft({
          supplierId: input.supplierId,
          productId: line.product_id,
          vendorInvoiceId: input.vendorInvoiceId,
          itemName: line.item_name,
          scannedUnitCost: line.unit_cost,
          benchmarkCost: line.historical_avg_cost,
          thresholdPct: input.analyticsThresholdPct,
          source: 'OCR_SCAN' as PriceVarianceSource,
        }) ?? null;
      if (draft) drafts.push(draft);
    }

    if (line.needs_manual_review) {
      await prisma.supplierQualityEvent.create({
        data: {
          supplierId: input.supplierId,
          eventType: SUPPLIER_QUALITY_EVENT.OCR_LOW_CONFIDENCE,
          productId: line.product_id,
          vendorInvoiceId: input.vendorInvoiceId ?? null,
          itemName: line.item_name,
          metadata: {
            lineConfidence: line.line_confidence ?? null,
          },
        },
      });
    }

    if (!line.product_id) {
      await prisma.supplierQualityEvent.create({
        data: {
          supplierId: input.supplierId,
          eventType: SUPPLIER_QUALITY_EVENT.OCR_UNMATCHED_LINE,
          vendorInvoiceId: input.vendorInvoiceId ?? null,
          itemName: line.item_name,
          metadata: { unitCost: line.unit_cost },
        },
      });
    }
  }
  await persistPriceVarianceDrafts(drafts);
}

export async function recordReceivingDispositionAnalytics(input: {
  dispositionId: string;
  supplierId: string | null;
  itemName: string;
  reason: string;
}): Promise<void> {
  if (input.reason !== 'NOT_RECEIVED' || !input.supplierId) return;
  await prisma.supplierQualityEvent.create({
    data: {
      supplierId: input.supplierId,
      eventType: SUPPLIER_QUALITY_EVENT.NOT_RECEIVED,
      receivingDispositionId: input.dispositionId,
      itemName: input.itemName,
    },
  });
}

export async function resolveSupplierIdForProductName(itemName: string): Promise<string | null> {
  const product = await prisma.product.findFirst({
    where: {
      isManufactured: false,
      name: { equals: itemName.trim(), mode: 'insensitive' },
    },
    select: { supplier: true },
  });
  const supplierName = product?.supplier?.trim();
  if (!supplierName) return null;
  const supplier = await prisma.supplier.findFirst({
    where: { name: { equals: supplierName, mode: 'insensitive' } },
    select: { id: true },
  });
  return supplier?.id ?? null;
}
