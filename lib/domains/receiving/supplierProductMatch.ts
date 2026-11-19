import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { matchProductWithScore } from '@/lib/domains/inventory/productMatching';
import type { OcrDraftLine } from '@/lib/domains/receiving/invoiceOcrCommit';
import { matchSupplierByName } from '@/lib/domains/suppliers/supplierInvoiceMatch';
import { listSuppliers } from '@/lib/domains/suppliers/suppliers';

export const SUPPLIER_CODE_MAX = 32;
export const SUPPLIER_NAME_KEY_MAX = 160;
export const SUPPLIER_PRINTED_MAX = 160;

const CODE_STRIP = /[ .\-–—]/g;

export type SupplierMatchType = 'code' | 'name';
export type InvoiceMatchSource = 'code' | 'learned_name' | 'name';

export interface SupplierProductLinkRef {
  matchType: SupplierMatchType;
  matchKey: string;
  printedValue: string;
  productId: string;
  productName: string;
}

export interface InvoiceLineMatch<T> {
  product: T | null;
  score: number | null;
  source: InvoiceMatchSource | null;
  printedValue: string | null;
}

export interface SupplierMatchWrite {
  action: 'upsert' | 'delete';
  matchType: SupplierMatchType;
  matchKey: string;
  printedValue: string;
  productId?: string;
}

type Db = Prisma.TransactionClient | typeof prisma;

/** Trim, uppercase, and strip spaces, dashes, and dots. Blank or longer than 32 is null. */
export function normalizeSupplierCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase().replace(CODE_STRIP, '');
  if (!normalized || normalized.length > SUPPLIER_CODE_MAX) return null;
  return normalized;
}

/** Lowercase, trim, strip punctuation, and collapse spaces. Blank or longer than 160 is null. */
export function normalizeLineNameKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/ +/g, ' ');
  if (!normalized || normalized.length > SUPPLIER_NAME_KEY_MAX) return null;
  return normalized;
}

/** Printed text kept for the badge. Blank becomes null and is never stored. */
export function printedMatchValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return trimmed.length > SUPPLIER_PRINTED_MAX ? trimmed.slice(0, SUPPLIER_PRINTED_MAX) : trimmed;
}

function catalogProduct<T extends { id: string; name: string }>(
  catalog: readonly T[],
  productId: string
): T | null {
  return catalog.find((product) => product.id === productId) ?? null;
}

/**
 * Code, then a learned name, then the existing fuzzy name match.
 * A link is used only when its product is in `catalog` (active, not manufactured).
 */
export function matchInvoiceLine<T extends { id: string; name: string }>(input: {
  code?: string | null;
  name: string;
  /** Printed line, used for the learned-name step. Falls back to `name`. */
  printedName?: string | null;
  links: readonly SupplierProductLinkRef[];
  catalog: readonly T[];
  skip?: { matchType: SupplierMatchType; matchKey: string } | null;
}): InvoiceLineMatch<T> {
  const skip = input.skip;
  const codeKey = normalizeSupplierCode(input.code);
  if (codeKey && !(skip?.matchType === 'code' && skip.matchKey === codeKey)) {
    const link = input.links.find((row) => row.matchType === 'code' && row.matchKey === codeKey);
    const product = link ? catalogProduct(input.catalog, link.productId) : null;
    if (link && product) {
      return { product, score: 100, source: 'code', printedValue: link.printedValue };
    }
  }

  const learnedSource = input.printedName ?? input.name;
  const nameKey = normalizeLineNameKey(learnedSource);
  if (nameKey && !(skip?.matchType === 'name' && skip.matchKey === nameKey)) {
    const link = input.links.find((row) => row.matchType === 'name' && row.matchKey === nameKey);
    const product = link ? catalogProduct(input.catalog, link.productId) : null;
    if (link && product) {
      return { product, score: 100, source: 'learned_name', printedValue: link.printedValue };
    }
  }

  const fuzzy = matchProductWithScore(input.name, [...input.catalog]);
  if (!fuzzy) return { product: null, score: null, source: null, printedValue: null };
  return { product: fuzzy.product, score: fuzzy.score, source: 'name', printedValue: null };
}

function nameIdentity(line: {
  printed_name?: string | null;
  line_name?: string | null;
}): { matchType: 'name'; matchKey: string; printedValue: string } | null {
  const printed = printedMatchValue(line.printed_name ?? line.line_name);
  const matchKey = normalizeLineNameKey(printed);
  if (!printed || !matchKey) return null;
  return { matchType: 'name', matchKey, printedValue: printed };
}

function codeIdentity(line: {
  supplier_code?: string | null;
}): { matchType: 'code'; matchKey: string; printedValue: string } | null {
  const matchKey = normalizeSupplierCode(line.supplier_code);
  const printed = printedMatchValue(line.supplier_code);
  if (!matchKey || !printed) return null;
  return { matchType: 'code', matchKey, printedValue: printed };
}

/** The link a remember or unlink acts on. A code wins over a learned name. */
export function supplierMatchIdentity(line: {
  supplier_code?: string | null;
  printed_name?: string | null;
  line_name?: string | null;
  match_source?: InvoiceMatchSource | null;
}): { matchType: SupplierMatchType; matchKey: string; printedValue: string } | null {
  if (line.match_source === 'learned_name') return nameIdentity(line);
  return codeIdentity(line) ?? nameIdentity(line);
}

export function reapplySupplierLinks(
  lines: OcrDraftLine[],
  links: readonly SupplierProductLinkRef[],
  catalog: readonly { id: string; name: string }[]
): OcrDraftLine[] {
  return lines.map((line) => reapplyOneLine(line, links, catalog));
}

function reapplyOneLine(
  line: OcrDraftLine,
  links: readonly SupplierProductLinkRef[],
  catalog: readonly { id: string; name: string }[]
): OcrDraftLine {
  if (line.create_new === true) {
    return {
      ...line,
      product_id: '',
      product_picked: false,
      remember: false,
      match_source: undefined,
      match_printed_value: undefined,
      matched_product_name: undefined,
    };
  }
  if (line.product_picked === true && line.product_id.trim()) return line;

  const skip = line.unlink_match === true ? supplierMatchIdentity(line) : null;
  const hit = matchInvoiceLine({
    code: line.supplier_code,
    name: line.line_name?.trim() || line.printed_name?.trim() || '',
    printedName: line.printed_name ?? line.line_name,
    links,
    catalog,
    skip,
  });
  if (hit.source === 'code' || hit.source === 'learned_name') {
    if (!hit.product) return line;
    return {
      ...line,
      product_id: hit.product.id,
      match_source: hit.source,
      match_printed_value: hit.printedValue ?? undefined,
      matched_product_name: hit.product.name,
    };
  }
  const linkWasAutomatic = line.unlink_match === true || line.match_source === 'code' || line.match_source === 'learned_name';
  if (!linkWasAutomatic) return line;
  if (hit.source === 'name' && hit.product) {
    return {
      ...line,
      product_id: hit.product.id,
      match_source: 'name',
      match_printed_value: undefined,
      matched_product_name: hit.product.name,
    };
  }
  return {
    ...line,
    product_id: '',
    match_source: undefined,
    match_printed_value: undefined,
    matched_product_name: undefined,
  };
}

export function planSupplierMatchWrites(
  lines: ReadonlyArray<{
    supplier_code?: string | null;
    printed_name?: string | null;
    line_name?: string | null;
    product_id?: string | null;
    remember?: boolean;
    unlink_match?: boolean;
    create_new?: boolean;
    product_picked?: boolean;
    match_source?: InvoiceMatchSource | null;
  }>,
  supplierId: string | null | undefined
): SupplierMatchWrite[] {
  const supplier = supplierId?.trim() ?? '';
  if (!supplier) return [];
  const writes: SupplierMatchWrite[] = [];
  for (const line of lines) {
    if (line.unlink_match === true && line.product_picked !== true) {
      const identity = supplierMatchIdentity(line);
      if (!identity) continue;
      writes.push({ action: 'delete', ...identity });
      continue;
    }
    if (line.remember !== true || line.create_new === true) continue;
    const productId = line.product_id?.trim() ?? '';
    if (!productId) continue;
    const identity = codeIdentity(line) ?? nameIdentity(line);
    if (!identity) continue;
    writes.push({ action: 'upsert', ...identity, productId });
  }
  return writes;
}

function errorText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** True only for a missing supplier_product_matches table, not any other relation. */
export function isMissingSupplierProductMatches(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
  if (code !== 'P2021' && code !== '42P01') return false;
  const message = 'message' in error ? errorText((error as { message?: unknown }).message) : '';
  const meta =
    'meta' in error && (error as { meta?: unknown }).meta && typeof (error as { meta?: unknown }).meta === 'object'
      ? ((error as { meta: { table?: unknown; modelName?: unknown } }).meta)
      : {};
  const named = `${message}\n${errorText(meta.table)}\n${errorText(meta.modelName)}`.toLowerCase();
  return named.includes('supplier_product_matches');
}

function warnMissingSupplierProductMatches(): void {
  console.warn(
    '[freshloop] supplier_product_matches is not in this database yet. Invoice lines match by name only, and remembered links were not saved.'
  );
}

/** Active, non-manufactured links for one supplier. One query. A missing table is no links. */
export async function loadActiveSupplierProductLinks(
  supplierId: string,
  db: Db = prisma
): Promise<SupplierProductLinkRef[]> {
  const id = supplierId.trim();
  if (!id) return [];
  try {
    const rows = await db.supplierProductMatch.findMany({
      where: {
        supplierId: id,
        product: { catalogActive: true, isManufactured: false },
      },
      select: {
        matchType: true,
        matchKey: true,
        printedValue: true,
        productId: true,
        product: { select: { name: true } },
      },
    });
    return rows.flatMap((row) => {
      if (row.matchType !== 'code' && row.matchType !== 'name') return [];
      return [
        {
          matchType: row.matchType,
          matchKey: row.matchKey,
          printedValue: row.printedValue,
          productId: row.productId,
          productName: row.product.name,
        },
      ];
    });
  } catch (error) {
    if (!isMissingSupplierProductMatches(error)) throw error;
    warnMissingSupplierProductMatches();
    return [];
  }
}

/** Scan-time guess. No saved supplier, or an ambiguous name, loads nothing. */
export async function loadActiveSupplierProductLinksForVendor(vendorName: string): Promise<SupplierProductLinkRef[]> {
  const printed = vendorName.trim();
  if (!printed) return [];
  const suppliers = await listSuppliers();
  const match = matchSupplierByName(printed, suppliers);
  if (match.status !== 'matched') return [];
  return loadActiveSupplierProductLinks(match.supplier.id);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

type SavepointDb = {
  $executeRawUnsafe?: (query: string) => Promise<unknown>;
};

/**
 * A unique violation aborts the surrounding Postgres transaction.
 * Inside a stock transaction, a savepoint lets that post continue after one retry.
 * The root client is not in a transaction, and a test double has no raw executor.
 */
async function withoutAbortingTransaction<T>(db: Db, run: () => Promise<T>): Promise<T> {
  const raw = db as SavepointDb & { $transaction?: unknown };
  const execute = raw.$executeRawUnsafe?.bind(db);
  const insideTransaction = typeof raw.$transaction !== 'function';
  if (!execute || !insideTransaction) return run();
  const savepoint = `spm_link_${Math.floor(Math.random() * 1_000_000_000)}`;
  await execute(`SAVEPOINT ${savepoint}`);
  try {
    const result = await run();
    await execute(`RELEASE SAVEPOINT ${savepoint}`);
    return result;
  } catch (error) {
    await execute(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    throw error;
  }
}

export async function applySupplierMatchWrites(
  db: Db,
  supplierId: string,
  actorId: string,
  writes: readonly SupplierMatchWrite[]
): Promise<void> {
  const supplier = supplierId.trim();
  const actor = actorId.trim();
  if (!supplier || !actor || writes.length === 0) return;
  let warnedMissing = false;
  const skipBecauseTableIsMissing = (error: unknown): boolean => {
    if (!isMissingSupplierProductMatches(error)) return false;
    if (!warnedMissing) {
      warnedMissing = true;
      warnMissingSupplierProductMatches();
    }
    return true;
  };
  for (const write of writes) {
    if (!write.matchKey) continue;
    if (write.action === 'delete') {
      try {
        await withoutAbortingTransaction(db, () =>
          db.supplierProductMatch.deleteMany({
            where: { supplierId: supplier, matchType: write.matchType, matchKey: write.matchKey },
          })
        );
      } catch (error) {
        if (skipBecauseTableIsMissing(error)) return;
        throw error;
      }
      continue;
    }
    const productId = write.productId?.trim() ?? '';
    const printedValue = printedMatchValue(write.printedValue);
    if (!productId || !printedValue) continue;
    const where = {
      supplierId_matchType_matchKey: {
        supplierId: supplier,
        matchType: write.matchType,
        matchKey: write.matchKey,
      },
    };
    const update = { productId, printedValue, updatedById: actor };
    try {
      await withoutAbortingTransaction(db, () =>
        db.supplierProductMatch.upsert({
          where,
          create: {
            supplierId: supplier,
            matchType: write.matchType,
            matchKey: write.matchKey,
            printedValue,
            productId,
            createdById: actor,
            updatedById: actor,
          },
          update,
        })
      );
    } catch (error) {
      if (skipBecauseTableIsMissing(error)) return;
      if (!isUniqueViolation(error)) throw error;
      try {
        await withoutAbortingTransaction(db, () => db.supplierProductMatch.update({ where, data: update }));
      } catch (retryError) {
        if (skipBecauseTableIsMissing(retryError)) return;
        throw retryError;
      }
    }
  }
}
