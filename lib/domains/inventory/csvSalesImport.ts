import { createHash } from 'node:crypto';
import { InventoryLedgerError, prisma } from '@/lib/domains/inventory/ledger';
import { recordProductSale } from '@/lib/domains/inventory/recordSale';
import { SalePayloadConflictError } from '@/lib/domains/inventory/saleIdempotency';
import {
  classifyCsvSales,
  type CsvSalesPreview,
  type SkuHit,
} from '@/lib/domains/inventory/csvSalesParse';
import {
  CSV_SALES_MAX_BYTES,
  csvColumnMappingSchema,
  type CsvColumnMapping,
} from '@/lib/security/schemas/csvSalesImport';

/** Inactive POSMapping rows. SKU lookup ignores this prefix, so no new table is required. */
export const CSV_COLUMN_MAP_PREFIX = 'CSV_COLUMNS:';

export function csvColumnMapPosSystem(storeId: string): string {
  return `${CSV_COLUMN_MAP_PREFIX}${storeId}`;
}

export function csvFileSha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function assertCsvSize(csv: string): void {
  if (Buffer.byteLength(csv, 'utf8') > CSV_SALES_MAX_BYTES) {
    throw new InventoryLedgerError(
      'That CSV is too large. The limit is 1 MB.',
      'CSV_TOO_LARGE',
      413
    );
  }
}

export async function loadCsvColumnMapping(storeId: string): Promise<CsvColumnMapping | null> {
  const row = await prisma.pOSMapping.findFirst({
    where: { posSystem: csvColumnMapPosSystem(storeId), isActive: false },
    orderBy: { updatedAt: 'desc' },
  });
  if (!row) return null;
  try {
    const parsed = csvColumnMappingSchema.safeParse(JSON.parse(row.externalSku));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveCsvColumnMapping(
  storeId: string,
  mapping: CsvColumnMapping
): Promise<CsvColumnMapping> {
  const parsed = csvColumnMappingSchema.parse(mapping);
  const posSystem = csvColumnMapPosSystem(storeId);
  await prisma.$transaction(async (db) => {
    await db.pOSMapping.deleteMany({ where: { posSystem } });
    await db.pOSMapping.create({
      data: {
        posSystem,
        externalSku: JSON.stringify(parsed),
        isActive: false,
      },
    });
  });
  return parsed;
}

async function lookupSkus(skus: string[]): Promise<Map<string, SkuHit>> {
  const unique = [...new Set(skus.map((sku) => sku.trim()).filter(Boolean))];
  const found = new Map<string, SkuHit>();
  if (unique.length === 0) return found;
  const rows = await prisma.pOSMapping.findMany({
    where: {
      externalSku: { in: unique },
      isActive: true,
      productId: { not: null },
      NOT: { posSystem: { startsWith: CSV_COLUMN_MAP_PREFIX } },
      product: { is: { catalogActive: true } },
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      externalSku: true,
      productId: true,
      product: { select: { name: true } },
    },
  });
  for (const row of rows) {
    if (!row.productId || found.has(row.externalSku)) continue;
    found.set(row.externalSku, {
      productId: row.productId,
      productName: row.product?.name ?? row.externalSku,
    });
  }
  return found;
}

async function existingSaleKeys(keys: string[]): Promise<Set<string>> {
  const unique = [...new Set(keys)];
  const found = new Set<string>();
  const size = 500;
  for (let index = 0; index < unique.length; index += size) {
    const slice = unique.slice(index, index + size);
    const rows = await prisma.ledgerIdempotencyKey.findMany({
      where: { key: { in: slice } },
      select: { key: true },
    });
    for (const row of rows) found.add(row.key);
  }
  return found;
}

async function classifyStored(input: {
  csv: string;
  mapping: CsvColumnMapping;
  knownKeys?: ReadonlySet<string>;
}): Promise<CsvSalesPreview> {
  assertCsvSize(input.csv);
  const fileSha256 = csvFileSha256(input.csv);
  const probe = classifyCsvSales({
    csv: input.csv,
    mapping: input.mapping,
    fileSha256,
    resolveSku: () => null,
  });
  if (!probe.ok) {
    throw new InventoryLedgerError(probe.error, 'CSV_IMPORT', 400);
  }
  const skus = probe.preview.rows.map((row) => row.sku).filter(Boolean);
  const catalog = await lookupSkus(skus);
  const keys = probe.preview.rows
    .map((row) => row.idempotencyKey)
    .filter((key): key is string => Boolean(key));
  const existing = input.knownKeys ?? (await existingSaleKeys(keys));
  const classified = classifyCsvSales({
    csv: input.csv,
    mapping: input.mapping,
    fileSha256,
    resolveSku: (sku) => catalog.get(sku) ?? null,
    existingKeys: existing,
  });
  if (!classified.ok) {
    throw new InventoryLedgerError(classified.error, 'CSV_IMPORT', 400);
  }
  return classified.preview;
}

/** Parse and match. Does not post ledger rows. Saves the mapping that was applied. */
export async function previewCsvSales(input: {
  csv: string;
  mapping: CsvColumnMapping;
  storeId: string;
}): Promise<CsvSalesPreview> {
  const preview = await classifyStored(input);
  await saveCsvColumnMapping(input.storeId, preview.mapping);
  return preview;
}

export interface CsvConfirmResult {
  preview: CsvSalesPreview;
  posted: number;
  alreadyPosted: number;
  failed: { rowIndex: number; message: string }[];
}

/** Post matched lines through recordProductSale. Unknown, bad, and duplicate lines are skipped. */
export async function confirmCsvSales(input: {
  csv: string;
  mapping: CsvColumnMapping;
  storeId: string;
  staffId: string;
}): Promise<CsvConfirmResult> {
  const preview = await classifyStored(input);
  await saveCsvColumnMapping(input.storeId, preview.mapping);
  let posted = 0;
  let alreadyPosted = 0;
  const failed: CsvConfirmResult['failed'] = [];

  for (const row of preview.matched) {
    if (!row.productId || row.qty == null || row.revenue == null || !row.soldAt || !row.idempotencyKey) {
      continue;
    }
    try {
      const sale = await recordProductSale({
        productId: row.productId,
        quantity: row.qty,
        staffId: input.staffId,
        location: 'floor',
        lineRevenue: row.revenue,
        soldAt: new Date(row.soldAt),
        referenceId: row.idempotencyKey,
        idempotencyKey: row.idempotencyKey,
      });
      if (sale.idempotent) alreadyPosted += 1;
      else posted += 1;
    } catch (error) {
      const message =
        error instanceof SalePayloadConflictError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'This line was not posted.';
      failed.push({ rowIndex: row.rowIndex, message });
    }
  }

  return { preview, posted, alreadyPosted, failed };
}
