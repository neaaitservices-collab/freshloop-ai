import { z } from 'zod';
import { numericInput } from '@/lib/security/numericInput';

/**
 * Multi-page invoice scan.
 * Page images stay on the phone. The draft stores read results only, so a failed
 * page is retaken. One request reads at most a few pages so the 60s route cap holds.
 */

/** Matches `INVOICE_PDF_MAX_PAGES`. */
export const INVOICE_PAGE_MAX = 8;
/** Pages read at once. Nelson asked for a small parallel batch of 2–3. */
export const INVOICE_PAGE_BATCH_SIZE = 3;
/** Matches `INVOICE_OCR_TOTAL_BUDGET_MS` (one wave of parallel reads). */
export const INVOICE_PAGE_ATTEMPT_BUDGET_MS = 25_000;
/**
 * Stop starting another wave before the route's 60s maxDuration.
 * Two slow waves are 50s, which does not fit; the phone sends the rest.
 */
export const INVOICE_PAGE_REQUEST_BUDGET_MS = 48_000;
/** A scanning page older than this was abandoned (refresh or a dead request). */
export const INVOICE_PAGE_STALE_MS = 70_000;
/** Matches `INVOICE_LINE_TOTAL_TOLERANCE`. */
export const INVOICE_PAGE_TOTAL_TOLERANCE = 0.02;
/** Matches `MAX_RECEIVING_BATCH_SIZE`. */
export const INVOICE_PAGE_LINE_MAX = 80;

export const DIFFERENT_INVOICES_BLOCKER = 'Pages may be from different invoices';
export const PAGE_CAP_MESSAGE = '8 pages max per invoice';

export type InvoicePageStatus = 'pending' | 'scanning' | 'read' | 'failed';
export type InvoiceScanStatus = 'scanning' | 'ready' | 'failed';

export type InvoicePageDepartment =
  | 'PRODUCE'
  | 'DAIRY'
  | 'BAKERY'
  | 'PANTRY'
  | 'DELI_KITCHEN'
  | 'GROCERY';

export interface InvoicePageLine {
  page: number;
  name: string;
  code?: string;
  /** Missing when the quantity was blank or unreadable. Not stored as 0. */
  quantity?: number;
  unit: string;
  unitCost?: number;
  totalCost?: number;
  department: InvoicePageDepartment;
  casePackSize: number;
  subUnit: string;
  caseRetailPrice?: number | null;
  extractionConfidence?: number;
  /** Position in the merged page order, so undo puts a line back where it was. */
  sourceOrder?: number;
  departmentAssumed?: boolean;
  quantityUnreadable?: boolean;
  costUnreadable?: boolean;
  unitInvalid?: boolean;
  lineTotalMismatch?: boolean;
  lineTotalNote?: string | null;
}

export interface ScanPageState {
  index: number;
  status: InvoicePageStatus;
  attempt: number;
  updatedAt: string;
  error?: string;
  vendorName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceDateNeedsConfirm?: boolean;
  invoiceDateConfirmReason?: string | null;
  subtotal?: number;
  hst?: number;
  pst?: number;
  lines?: InvoicePageLine[];
}

export interface PageScanRecord {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceDateNeedsConfirm?: boolean;
  invoiceDateConfirmReason?: string;
  totalAmount: number;
  departmentBreakdown: Record<string, number>;
  scanStatus: InvoiceScanStatus;
  scanAudited: boolean;
  clientScanId: string;
  pageCount: number;
  scanPages: ScanPageState[];
  dedupedCount: number;
  dedupedFrom: number[];
  dedupeUndone: boolean;
  totalsFromPage: number | null;
  printedSubtotal?: number;
  printedHst?: number;
  printedPst?: number;
  pageScanBlockers: string[];
  pageScanReviewFlags: string[];
}

export interface PageFact {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceDateNeedsConfirm: boolean;
  invoiceDateConfirmReason: string | null;
  subtotal?: number;
  hst?: number;
  pst?: number;
  lines: InvoicePageLine[];
}

export interface MergedInvoicePages {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceDateNeedsConfirm: boolean;
  invoiceDateConfirmReason: string | null;
  lines: InvoicePageLine[];
  dedupedCount: number;
  dedupedFrom: number[];
  totalsFromPage: number | null;
  printedSubtotal?: number;
  printedHst?: number;
  printedPst?: number;
  pageScanBlockers: string[];
  pageScanReviewFlags: string[];
  lineSum?: number;
}

const optionalMoney = z.preprocess((value) => {
  if (value == null) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
}, numericInput(z.number().finite().nonnegative()).optional());

/** Blank, null, and junk become undefined. A printed 0 stays 0. */
export function readOptionalMoney(value: unknown): number | undefined {
  const parsed = optionalMoney.safeParse(value);
  if (!parsed.success || parsed.data === undefined) return undefined;
  return parsed.data;
}

export function readPrintedMoneyFields(raw: unknown): {
  subtotal?: number;
  hst?: number;
  pst?: number;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const subtotal = readOptionalMoney(record.subtotal ?? record.subTotal);
  const hst = readOptionalMoney(record.hst ?? record.HST);
  const pst = readOptionalMoney(record.pst ?? record.PST);
  return {
    ...(subtotal !== undefined ? { subtotal } : {}),
    ...(hst !== undefined ? { hst } : {}),
    ...(pst !== undefined ? { pst } : {}),
  };
}

/** Item codes only when every raw row survived as a stock line, so indexes still match. */
export function codesIfUnfiltered(raw: unknown, stockCount: number): Array<string | undefined> {
  const blanks = Array.from({ length: stockCount }, () => undefined);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return blanks;
  const record = raw as Record<string, unknown>;
  const lines = record.lineItems ?? record.line_items;
  if (!Array.isArray(lines) || lines.length !== stockCount) return blanks;
  return lines.map((line) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) return undefined;
    const code = (line as { code?: unknown }).code;
    if (typeof code !== 'string') return undefined;
    const trimmed = code.trim();
    return trimmed || undefined;
  });
}

export function chunkPages<T>(items: T[], size = INVOICE_PAGE_BATCH_SIZE): T[][] {
  const width = Math.max(1, Math.floor(size));
  const waves: T[][] = [];
  for (let index = 0; index < items.length; index += width) {
    waves.push(items.slice(index, index + width));
  }
  return waves;
}

/** True when another parallel wave can finish inside this request. */
export function waveFitsInRequest(
  nowMs: number,
  startedAtMs: number,
  pageBudgetMs = INVOICE_PAGE_ATTEMPT_BUDGET_MS,
  requestBudgetMs = INVOICE_PAGE_REQUEST_BUDGET_MS
): boolean {
  return nowMs + pageBudgetMs <= startedAtMs + requestBudgetMs;
}

export function nextPendingWave(pages: ScanPageState[], size = INVOICE_PAGE_BATCH_SIZE): ScanPageState[] {
  return pages
    .filter((page) => page.status === 'pending')
    .sort((a, b) => a.index - b.index)
    .slice(0, Math.max(1, size));
}

/** Pending pages the phone actually sent, in order, capped at one wave. */
export function nextSuppliedWave(
  pages: ScanPageState[],
  suppliedIndexes: number[],
  size = INVOICE_PAGE_BATCH_SIZE
): ScanPageState[] {
  const have = new Set(suppliedIndexes);
  return pages
    .filter((page) => page.status === 'pending' && have.has(page.index))
    .sort((a, b) => a.index - b.index)
    .slice(0, Math.max(1, size));
}

/** Delay before the next wave after a 429. The delay itself comes from `geminiBackoffMs`. */
export function nextWaveDelayMs(
  rateLimited: boolean,
  backoffMs: (retryAfter: string | null, randomUnit?: number) => number,
  randomUnit = 0
): number {
  if (!rateLimited) return 0;
  return backoffMs(null, randomUnit);
}

export function isGeminiRateLimitMessage(message: string): boolean {
  return /\b429\b|RESOURCE_EXHAUSTED|rate limit/i.test(message);
}

export function pageFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (isGeminiRateLimitMessage(message)) {
    return 'The reader was rate limited. Retry this page in a moment.';
  }
  if (
    message.startsWith('Could not prepare') ||
    message.startsWith('This PDF') ||
    /timed out/i.test(message) ||
    /No stock lines/i.test(message)
  ) {
    return message;
  }
  return 'This page could not be read. Retry it or take another photo.';
}

export function createScanPages(pageCount: number, nowIso: string): ScanPageState[] {
  const count = Math.min(INVOICE_PAGE_MAX, Math.max(0, Math.floor(pageCount)));
  return Array.from({ length: count }, (_, index) => ({
    index: index + 1,
    status: 'pending' as const,
    attempt: 0,
    updatedAt: nowIso,
  }));
}

export function initialPageScan(clientScanId: string, pageCount: number, nowIso: string): PageScanRecord {
  return {
    vendorName: '',
    invoiceNumber: '',
    invoiceDate: '',
    totalAmount: 0,
    departmentBreakdown: {},
    scanStatus: 'scanning',
    scanAudited: false,
    clientScanId,
    pageCount,
    scanPages: createScanPages(pageCount, nowIso),
    dedupedCount: 0,
    dedupedFrom: [],
    dedupeUndone: false,
    totalsFromPage: null,
    pageScanBlockers: [],
    pageScanReviewFlags: [],
  };
}

function cloneScan<T extends PageScanRecord>(scan: T): T {
  return {
    ...scan,
    scanPages: scan.scanPages.map((page) => ({
      ...page,
      lines: page.lines?.map((line) => ({ ...line })),
    })),
    dedupedFrom: [...scan.dedupedFrom],
    pageScanBlockers: [...scan.pageScanBlockers],
    pageScanReviewFlags: [...scan.pageScanReviewFlags],
    departmentBreakdown: { ...scan.departmentBreakdown },
  };
}

export function overallScanStatus(pages: ScanPageState[]): InvoiceScanStatus {
  if (pages.length === 0) return 'failed';
  if (pages.some((page) => page.status === 'pending' || page.status === 'scanning')) return 'scanning';
  if (pages.some((page) => page.status === 'failed')) return 'failed';
  return 'ready';
}

/** Mark abandoned reads as failed without bumping the attempt, so a late result can still land. */
export function settleStaleScanningPages<T extends PageScanRecord>(scan: T, nowMs: number): T {
  let changed = false;
  const scanPages = scan.scanPages.map((page) => {
    if (page.status !== 'scanning') return page;
    const updated = Date.parse(page.updatedAt);
    if (!Number.isFinite(updated) || nowMs - updated < INVOICE_PAGE_STALE_MS) return page;
    changed = true;
    return {
      ...page,
      status: 'failed' as const,
      error: 'The read stopped. Retake this page.',
      updatedAt: new Date(nowMs).toISOString(),
    };
  });
  if (!changed) return scan;
  const next = cloneScan(scan);
  next.scanPages = scanPages;
  next.scanStatus = overallScanStatus(scanPages);
  next.scanAudited = false;
  return next;
}

export function markPagesScanning<T extends PageScanRecord>(
  scan: T,
  indexes: number[],
  nowIso: string
): { scan: T; attempts: Record<number, number> } {
  const wanted = new Set(indexes);
  const attempts: Record<number, number> = {};
  const next = cloneScan(scan);
  next.scanPages = next.scanPages.map((page) => {
    if (!wanted.has(page.index) || page.status !== 'pending') return page;
    const attempt = page.attempt + 1;
    attempts[page.index] = attempt;
    return {
      ...page,
      status: 'scanning' as const,
      attempt,
      updatedAt: nowIso,
      error: undefined,
    };
  });
  next.scanStatus = 'scanning';
  next.scanAudited = false;
  return { scan: next, attempts };
}

function pageByIndex(scan: PageScanRecord, index: number): ScanPageState | undefined {
  return scan.scanPages.find((page) => page.index === index);
}

export function recordPageRead<T extends PageScanRecord>(
  scan: T,
  index: number,
  attempt: number,
  fact: PageFact,
  nowIso: string
): T {
  const current = pageByIndex(scan, index);
  if (!current || current.attempt !== attempt || current.status === 'read') return scan;
  const next = cloneScan(scan);
  next.scanPages = next.scanPages.map((page) => {
    if (page.index !== index) return page;
    return {
      ...page,
      status: 'read' as const,
      updatedAt: nowIso,
      error: undefined,
      vendorName: fact.vendorName,
      invoiceNumber: fact.invoiceNumber,
      invoiceDate: fact.invoiceDate,
      invoiceDateNeedsConfirm: fact.invoiceDateNeedsConfirm,
      invoiceDateConfirmReason: fact.invoiceDateConfirmReason,
      ...(fact.subtotal !== undefined ? { subtotal: fact.subtotal } : { subtotal: undefined }),
      ...(fact.hst !== undefined ? { hst: fact.hst } : { hst: undefined }),
      ...(fact.pst !== undefined ? { pst: fact.pst } : { pst: undefined }),
      lines: fact.lines.map((line) => ({ ...line, page: index })),
    };
  });
  const pageStatus = overallScanStatus(next.scanPages);
  next.scanStatus = pageStatus === 'ready' ? 'scanning' : pageStatus;
  next.scanAudited = false;
  return next;
}

export function recordPageFailure<T extends PageScanRecord>(
  scan: T,
  index: number,
  attempt: number,
  error: string,
  nowIso: string
): T {
  const current = pageByIndex(scan, index);
  if (!current || current.attempt !== attempt || current.status === 'read') return scan;
  const next = cloneScan(scan);
  next.scanPages = next.scanPages.map((page) => {
    if (page.index !== index) return page;
    return {
      ...page,
      status: 'failed' as const,
      updatedAt: nowIso,
      error,
      lines: undefined,
    };
  });
  next.scanStatus = overallScanStatus(next.scanPages);
  next.scanAudited = false;
  return next;
}

export type PageRereadResult<T> =
  | { ok: true; scan: T; attempt: number }
  | { ok: false; error: string };

/**
 * Start a one-page reread. Retry and retake both send a photo the server does not keep.
 * A page that already read is left alone.
 */
export function beginPageReread<T extends PageScanRecord>(
  scan: T,
  index: number,
  nowIso: string,
  nowMs = Date.parse(nowIso)
): PageRereadResult<T> {
  const current = pageByIndex(scan, index);
  if (!current) return { ok: false, error: 'That page is not on this invoice.' };
  if (current.status === 'read') {
    return { ok: false, error: 'That page already read. It was not scanned again.' };
  }
  if (current.status === 'scanning') {
    const updated = Date.parse(current.updatedAt);
    const fresh = Number.isFinite(updated) && nowMs - updated < INVOICE_PAGE_STALE_MS;
    if (fresh) return { ok: false, error: 'That page is already being read.' };
  }
  const next = cloneScan(scan);
  let attempt = current.attempt;
  next.scanPages = next.scanPages.map((page) => {
    if (page.index !== index) return page;
    attempt = page.attempt + 1;
    return {
      index: page.index,
      status: 'scanning' as const,
      attempt,
      updatedAt: nowIso,
    };
  });
  next.scanStatus = 'scanning';
  next.scanAudited = false;
  next.pageScanBlockers = [];
  next.pageScanReviewFlags = [];
  next.dedupedCount = 0;
  next.dedupedFrom = [];
  return { ok: true, scan: next, attempt };
}

function normLabel(code: string | undefined, name: string): string {
  const printed = code?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
  if (printed) return printed;
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function moneyKey(value: number | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value.toFixed(2);
}

function qtyKey(value: number | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value.toFixed(4);
}

/** Identical lines match only when every compared field was actually read. */
export function lineIdentityKey(line: InvoicePageLine): string | null {
  const qty = qtyKey(line.quantity);
  const unitCost = moneyKey(line.unitCost);
  const total = moneyKey(line.totalCost);
  if (qty == null || unitCost == null || total == null) return null;
  const unit = line.unit.trim().toLowerCase();
  return `${normLabel(line.code, line.name)}|${qty}|${unit}|${unitCost}|${total}`;
}

export interface DedupeResult<T> {
  kept: T[];
  removed: T[];
  dedupedCount: number;
  dedupedFrom: number[];
}

export function dedupeCrossPageLines<T extends InvoicePageLine>(lines: T[]): DedupeResult<T> {
  const seen = new Map<string, T>();
  const kept: T[] = [];
  const removed: T[] = [];
  const pages = new Set<number>();
  for (const line of lines) {
    const key = lineIdentityKey(line);
    if (!key) {
      kept.push(line);
      continue;
    }
    const prior = seen.get(key);
    if (!prior || prior.page === line.page) {
      kept.push(line);
      if (!prior) seen.set(key, line);
      continue;
    }
    removed.push(line);
    pages.add(prior.page);
    pages.add(line.page);
  }
  return {
    kept,
    removed,
    dedupedCount: removed.length,
    dedupedFrom: [...pages].sort((a, b) => a - b),
  };
}

/** Put removed lines back in page order. A second undo changes nothing. */
export function undoCrossPageDedupe<T extends InvoicePageLine>(kept: T[], removed: T[]): DedupeResult<T> {
  if (removed.length === 0) {
    return { kept: [...kept], removed: [], dedupedCount: 0, dedupedFrom: [] };
  }
  const order = new Map<T, number>();
  kept.forEach((line, index) => order.set(line, index));
  const restored = [...kept, ...removed].sort((a, b) => {
    const aOrder = a.sourceOrder ?? order.get(a) ?? 0;
    const bOrder = b.sourceOrder ?? order.get(b) ?? 0;
    if (aOrder !== bOrder) return aOrder - bOrder;
    if (a.page !== b.page) return a.page - b.page;
    return 0;
  });
  return { kept: restored, removed: [], dedupedCount: 0, dedupedFrom: [] };
}

export function duplicateRemovalNote(count: number, pages: number[]): string {
  if (count <= 0) return '';
  const label = count === 1 ? '1 duplicate removed' : `${count} duplicates removed`;
  const where = formatPageSpan(pages);
  return where ? `${label} (repeated on pages ${where})` : label;
}

function formatPageSpan(pages: number[]): string {
  const sorted = [...new Set(pages.filter((page) => Number.isInteger(page) && page > 0))].sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  if (sorted.length === 1) return String(sorted[0]);
  const consecutive = sorted.every((page, index) => index === 0 || page === sorted[index - 1]! + 1);
  if (consecutive) return `${sorted[0]}–${sorted[sorted.length - 1]}`;
  return sorted.join(', ');
}

function normHeader(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function firstText(pages: ScanPageState[], field: 'vendorName' | 'invoiceNumber' | 'invoiceDate'): string {
  for (const page of pages) {
    const value = page[field]?.trim() ?? '';
    if (value) return value;
  }
  return '';
}

export function mergeReadPages(
  pages: ScanPageState[],
  options?: { dedupeUndone?: boolean; lineMax?: number; tolerance?: number }
): MergedInvoicePages {
  const read = [...pages].filter((page) => page.status === 'read').sort((a, b) => a.index - b.index);
  const vendorName = firstText(read, 'vendorName');
  const invoiceNumber = firstText(read, 'invoiceNumber');
  const invoiceDate = firstText(read, 'invoiceDate');
  const blockers: string[] = [];
  const vendorKey = normHeader(vendorName);
  const invoiceKey = normHeader(invoiceNumber);
  for (const page of read) {
    const vendor = normHeader(page.vendorName);
    const invoice = normHeader(page.invoiceNumber);
    if ((vendor && vendorKey && vendor !== vendorKey) || (invoice && invoiceKey && invoice !== invoiceKey)) {
      blockers.push(DIFFERENT_INVOICES_BLOCKER);
      break;
    }
  }

  let invoiceDateNeedsConfirm = false;
  let invoiceDateConfirmReason: string | null = null;
  const dateKey = invoiceDate.trim();
  for (const page of read) {
    const date = page.invoiceDate?.trim() ?? '';
    if (date && dateKey && date !== dateKey) {
      invoiceDateNeedsConfirm = true;
      invoiceDateConfirmReason = 'Pages do not agree on the invoice date. Pick the date from the paper.';
      break;
    }
  }
  if (!invoiceDateNeedsConfirm) {
    const source = read.find((page) => (page.invoiceDate?.trim() ?? '') === dateKey && dateKey);
    if (source?.invoiceDateNeedsConfirm) {
      invoiceDateNeedsConfirm = true;
      invoiceDateConfirmReason = source.invoiceDateConfirmReason?.trim() || null;
    }
  }

  const ordered = read.flatMap((page) => (page.lines ?? []).map((line) => ({ ...line, page: page.index })));
  ordered.forEach((line, index) => {
    line.sourceOrder = index;
  });
  const deduped = options?.dedupeUndone
    ? { kept: ordered, removed: [] as InvoicePageLine[], dedupedCount: 0, dedupedFrom: [] as number[] }
    : dedupeCrossPageLines(ordered);

  let totalsFromPage: number | null = null;
  let printedSubtotal: number | undefined;
  let printedHst: number | undefined;
  let printedPst: number | undefined;
  for (const page of read) {
    if (typeof page.subtotal === 'number' && page.subtotal > 0) {
      totalsFromPage = page.index;
      printedSubtotal = page.subtotal;
      printedHst = page.hst;
      printedPst = page.pst;
    }
  }

  const lineMax = options?.lineMax ?? INVOICE_PAGE_LINE_MAX;
  if (deduped.kept.length > lineMax) {
    blockers.push(`This invoice has ${deduped.kept.length} lines. ${lineMax} lines is the maximum.`);
  }

  const reviewFlags: string[] = [];
  let lineSum: number | undefined;
  if (printedSubtotal !== undefined) {
    lineSum = Number(
      deduped.kept
        .reduce((sum, line) => sum + (typeof line.totalCost === 'number' ? line.totalCost : 0), 0)
        .toFixed(2)
    );
    const tolerance = options?.tolerance ?? INVOICE_PAGE_TOTAL_TOLERANCE;
    if (Math.abs(Math.round(printedSubtotal * 100) - Math.round(lineSum * 100)) > Math.round(tolerance * 100)) {
      reviewFlags.push(
        `Invoice subtotal ${printedSubtotal.toFixed(2)} does not match the line sum ${lineSum.toFixed(2)}.`
      );
    }
  }

  return {
    vendorName,
    invoiceNumber,
    invoiceDate,
    invoiceDateNeedsConfirm,
    invoiceDateConfirmReason,
    lines: deduped.kept,
    dedupedCount: deduped.dedupedCount,
    dedupedFrom: deduped.dedupedFrom,
    totalsFromPage,
    ...(printedSubtotal !== undefined ? { printedSubtotal } : {}),
    ...(printedHst !== undefined ? { printedHst } : {}),
    ...(printedPst !== undefined ? { printedPst } : {}),
    pageScanBlockers: [...new Set(blockers)],
    pageScanReviewFlags: reviewFlags,
    ...(lineSum !== undefined ? { lineSum } : {}),
  };
}

export function finalizeReadyScan<T extends PageScanRecord>(scan: T): T {
  if (overallScanStatus(scan.scanPages) !== 'ready') return scan;
  const merged = mergeReadPages(scan.scanPages, { dedupeUndone: scan.dedupeUndone });
  const next = cloneScan(scan);
  next.vendorName = merged.vendorName;
  next.invoiceNumber = merged.invoiceNumber;
  next.invoiceDate = merged.invoiceDate;
  next.invoiceDateNeedsConfirm = merged.invoiceDateNeedsConfirm;
  if (merged.invoiceDateConfirmReason) next.invoiceDateConfirmReason = merged.invoiceDateConfirmReason;
  else delete next.invoiceDateConfirmReason;
  next.dedupedCount = merged.dedupedCount;
  next.dedupedFrom = merged.dedupedFrom;
  next.totalsFromPage = merged.totalsFromPage;
  if (merged.printedSubtotal !== undefined) next.printedSubtotal = merged.printedSubtotal;
  else delete next.printedSubtotal;
  if (merged.printedHst !== undefined) next.printedHst = merged.printedHst;
  else delete next.printedHst;
  if (merged.printedPst !== undefined) next.printedPst = merged.printedPst;
  else delete next.printedPst;
  next.pageScanBlockers = merged.pageScanBlockers;
  next.pageScanReviewFlags = merged.pageScanReviewFlags;
  next.scanStatus = 'ready';
  next.scanAudited = false;
  if (merged.lineSum !== undefined) next.totalAmount = merged.lineSum;
  return next;
}

export function undoDedupeOnScan<T extends PageScanRecord>(scan: T): T {
  const next = cloneScan(scan);
  next.dedupeUndone = true;
  if (overallScanStatus(next.scanPages) !== 'ready') return next;
  return finalizeReadyScan(next);
}

export function duplicateNoteForScan(scan: Pick<PageScanRecord, 'dedupedCount' | 'dedupedFrom' | 'dedupeUndone'>): string {
  if (scan.dedupeUndone) return '';
  return duplicateRemovalNote(scan.dedupedCount, scan.dedupedFrom);
}

function isStatus(value: unknown): value is InvoicePageStatus {
  return value === 'pending' || value === 'scanning' || value === 'read' || value === 'failed';
}

function isScanStatus(value: unknown): value is InvoiceScanStatus {
  return value === 'scanning' || value === 'ready' || value === 'failed';
}

/** Restore a multi-page draft from JSON. Legacy single-page drafts return null. */
export function readStoredPageScan(raw: unknown): PageScanRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (!isScanStatus(record.scanStatus)) return null;
  if (typeof record.clientScanId !== 'string' || !record.clientScanId.trim()) return null;
  const pageCount = typeof record.pageCount === 'number' ? record.pageCount : 0;
  if (!Array.isArray(record.scanPages)) return null;
  const scanPages: ScanPageState[] = [];
  for (const entry of record.scanPages) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const page = entry as Record<string, unknown>;
    const index = typeof page.index === 'number' ? page.index : 0;
    if (!isStatus(page.status) || index < 1) continue;
    scanPages.push({
      index,
      status: page.status,
      attempt: typeof page.attempt === 'number' ? page.attempt : 0,
      updatedAt: typeof page.updatedAt === 'string' ? page.updatedAt : new Date(0).toISOString(),
      ...(typeof page.error === 'string' && page.error ? { error: page.error } : {}),
      ...(typeof page.vendorName === 'string' ? { vendorName: page.vendorName } : {}),
      ...(typeof page.invoiceNumber === 'string' ? { invoiceNumber: page.invoiceNumber } : {}),
      ...(typeof page.invoiceDate === 'string' ? { invoiceDate: page.invoiceDate } : {}),
      ...(page.invoiceDateNeedsConfirm === true ? { invoiceDateNeedsConfirm: true } : {}),
      ...(typeof page.invoiceDateConfirmReason === 'string'
        ? { invoiceDateConfirmReason: page.invoiceDateConfirmReason }
        : {}),
      ...(typeof page.subtotal === 'number' ? { subtotal: page.subtotal } : {}),
      ...(typeof page.hst === 'number' ? { hst: page.hst } : {}),
      ...(typeof page.pst === 'number' ? { pst: page.pst } : {}),
      ...(Array.isArray(page.lines) ? { lines: page.lines as InvoicePageLine[] } : {}),
    });
  }
  const subtotal = typeof record.printedSubtotal === 'number' ? record.printedSubtotal : undefined;
  const hst = typeof record.printedHst === 'number' ? record.printedHst : undefined;
  const pst = typeof record.printedPst === 'number' ? record.printedPst : undefined;
  return {
    vendorName: typeof record.vendorName === 'string' ? record.vendorName : '',
    invoiceNumber: typeof record.invoiceNumber === 'string' ? record.invoiceNumber : '',
    invoiceDate: typeof record.invoiceDate === 'string' ? record.invoiceDate : '',
    ...(record.invoiceDateNeedsConfirm === true ? { invoiceDateNeedsConfirm: true } : {}),
    ...(typeof record.invoiceDateConfirmReason === 'string'
      ? { invoiceDateConfirmReason: record.invoiceDateConfirmReason }
      : {}),
    totalAmount: typeof record.totalAmount === 'number' ? record.totalAmount : 0,
    departmentBreakdown:
      record.departmentBreakdown && typeof record.departmentBreakdown === 'object'
        ? (record.departmentBreakdown as Record<string, number>)
        : {},
    scanStatus: record.scanStatus,
    scanAudited: record.scanAudited === true,
    clientScanId: record.clientScanId.trim(),
    pageCount,
    scanPages,
    dedupedCount: typeof record.dedupedCount === 'number' ? record.dedupedCount : 0,
    dedupedFrom: Array.isArray(record.dedupedFrom)
      ? record.dedupedFrom.filter((page): page is number => typeof page === 'number')
      : [],
    dedupeUndone: record.dedupeUndone === true,
    totalsFromPage: typeof record.totalsFromPage === 'number' ? record.totalsFromPage : null,
    ...(subtotal !== undefined ? { printedSubtotal: subtotal } : {}),
    ...(hst !== undefined ? { printedHst: hst } : {}),
    ...(pst !== undefined ? { printedPst: pst } : {}),
    pageScanBlockers: Array.isArray(record.pageScanBlockers)
      ? record.pageScanBlockers.filter((item): item is string => typeof item === 'string')
      : [],
    pageScanReviewFlags: Array.isArray(record.pageScanReviewFlags)
      ? record.pageScanReviewFlags.filter((item): item is string => typeof item === 'string')
      : [],
  };
}
