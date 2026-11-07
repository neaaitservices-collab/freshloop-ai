import { prisma } from '@/lib/domains/inventory/ledger';
import { rememberLedgerRead } from '@/lib/domains/inventory/ledgerCache';
import type { PurchaseProductNameCatalog } from '@/lib/domains/inventory/stock';

const CATALOG_NAMES_MS = 60_000;
const catalogNamesCache = new Map<
  string,
  { at: number; gen: number; value: Promise<PurchaseProductNameCatalog> }
>();

async function loadCatalogProductNames(): Promise<PurchaseProductNameCatalog> {
  return prisma.product.findMany({
    where: { isManufactured: false, catalogActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

/** Cached id/name rows for fuzzy match (on-hand lookup, voice, OCR). */
export function getCatalogProductNames(): Promise<PurchaseProductNameCatalog> {
  return rememberLedgerRead(
    catalogNamesCache,
    'catalog-product-names',
    CATALOG_NAMES_MS,
    loadCatalogProductNames
  );
}
