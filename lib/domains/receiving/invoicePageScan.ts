import { z } from 'zod';
import { mergedPageInvoiceNumber } from '@/lib/domains/receiving/invoiceDeliveryId';
import { INVOICE_OCR_JSON_ERROR, interpretInvoiceOcrModel } from '@/lib/domains/receiving/invoiceOcrModel';
import { parseOcrInvoiceDate } from '@/lib/domains/receiving/invoiceOcrParse';
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
/**
 * Matches `INVOICE_OCR_TOTAL_BUDGET_MS`. Every page in the wave spends this
 * concurrently (`mapPool` with `INVOICE_PAGE_BATCH_SIZE`), so two or three pages
 * cost one page of wall clock. Image prep runs inside that same parallel call,
 * before the 40s attempt. The response uses the slack under maxDuration 60.
 */
export const INVOICE_PAGE_ATTEMPT_BUDGET_MS = 42_000;
/**
 * Stop starting another wave before the route's 60s maxDuration.
 * A wave needs this page budget, so a second wave fits only in the first 6s
 * (48s - 42s). A slow wave does not start another. The phone sends the rest.
 */
export const INVOICE_PAGE_REQUEST_BUDGET_MS = 48_000;
/**
 * Slack after the 40s attempt. The page deadline is 42s, so a follow-up read
 * needs the attempt plus this margin still inside the request budget.
 */
export const INVOICE_PAGE_RETRY_MARGIN_MS = 2_000;
export const INVOICE_PAGE_TOO_DENSE_MESSAGE =
  'Page too dense to read in one pass, please retake closer or split';
export const INVOICE_PAGE_EMPTY_LINES_MESSAGE =
  'No lines could be read on this page, please retake it closer and try again';
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
  gst?: number;
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
  printedGst?: number;
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
  gst?: number;
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
  printedGst?: number;
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
  gst?: number;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const subtotal = readOptionalMoney(record.subtotal ?? record.subTotal);
  const hst = readOptionalMoney(record.hst ?? record.HST);
  const pst = readOptionalMoney(record.pst ?? record.PST);
  const gst = readOptionalMoney(record.gst ?? record.GST);
  return {
    ...(subtotal !== undefined ? { subtotal } : {}),
    ...(hst !== undefined ? { hst } : {}),
    ...(pst !== undefined ? { pst } : {}),
    ...(gst !== undefined ? { gst } : {}),
  };
}

/**
 * Supplier codes for the stock lines the invoice parser kept, in that same order.
 * Shipped-0 and charge rows are left out with the same check as `interpretInvoiceOcrModel`,
 * so a code stays on the row that survived.
 */
export function codesIfUnfiltered(raw: unknown, stockCount: number): Array<string | undefined> {
  const blanks = Array.from({ length: stockCount }, () => undefined);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return blanks;
  const record = raw as Record<string, unknown>;
  const lines = record.lineItems ?? record.line_items;
  if (!Array.isArray(lines)) return blanks;
  const kept = lines.filter((line) => linePostsStock(line));
  if (kept.length !== stockCount) return blanks;
  return kept.map(readLineCode);
}

function readLineCode(line: unknown): string | undefined {
  if (!line || typeof line !== 'object' || Array.isArray(line)) return undefined;
  const code = (line as { code?: unknown }).code;
  if (typeof code !== 'string') return undefined;
  const trimmed = code.trim();
  return trimmed || undefined;
}

/** True when this raw row would be one of `interpretInvoiceOcrModel(...).lineItems`. */
function linePostsStock(line: unknown): boolean {
  try {
    return (
      interpretInvoiceOcrModel({
        vendorName: 'Supplier',
        invoiceNumber: '1',
        invoiceDate: '2026-01-01',
        lineItems: [line],
      }).lineItems.length > 0
    );
  } catch {
    return false;
  }
}

export function chunkPages<T>(items: T[], size = INVOICE_PAGE_BATCH_SIZE): T[][] {
  const width = Math.max(1, Math.floor(size));
  const waves: T[][] = [];
  for (let index = 0; index < items.length; index += width) {
    waves.push(items.slice(index, index + width));
  }
  return waves;
}

/**
 * A 429 follow-up is another full attempt. It starts only when the request
 * budget still holds that attempt plus margin. Otherwise the page stays failed
 * and can be sent again.
 */
export function rateLimitRetryFits(
  nowMs: number,
  startedAtMs: number,
  attemptMs = INVOICE_PAGE_ATTEMPT_BUDGET_MS - INVOICE_PAGE_RETRY_MARGIN_MS,
  marginMs = INVOICE_PAGE_RETRY_MARGIN_MS,
  requestBudgetMs = INVOICE_PAGE_REQUEST_BUDGET_MS
): boolean {
  return nowMs + attemptMs + marginMs <= startedAtMs + requestBudgetMs;
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

export type InvoicePageFailureStage = 'json' | 'zod' | 'interpret' | 'abort' | '429' | 'empty';

const INVOICE_PAGE_FAILURE_STAGES = new Set<InvoicePageFailureStage>([
  'json',
  'zod',
  'interpret',
  'abort',
  '429',
  'empty',
]);

/** Counts only. Never vendor names, amounts, or line text. */
export interface InvoicePageLineShape {
  lineCount: number;
  lineItemsIsArray: boolean;
  keyCount: number;
}

/**
 * Shape of a model object. `lineItems` wins over `line_items`, matching the reader.
 * Returns null when the value is not an object. No field values are copied out.
 */
export function invoicePageLineShape(raw: unknown): InvoicePageLineShape | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const chosen = Object.prototype.hasOwnProperty.call(record, 'lineItems') ? record.lineItems : record.line_items;
  const lineItemsIsArray = Array.isArray(chosen);
  return {
    lineCount: lineItemsIsArray ? chosen.length : 0,
    lineItemsIsArray,
    keyCount: Object.keys(record).length,
  };
}

/**
 * True when the model object has no line list, a null list, or an empty list.
 * A non-empty list is not empty, including a totals-only page whose rows do not post stock.
 */
export function invoicePageLinesMissing(raw: unknown): boolean {
  if (!invoicePageLineShape(raw) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const record = raw as Record<string, unknown>;
  const hasLineItems = Object.prototype.hasOwnProperty.call(record, 'lineItems');
  const hasLineItemsAlias = Object.prototype.hasOwnProperty.call(record, 'line_items');
  if (!hasLineItems && !hasLineItemsAlias) return true;
  const chosen = hasLineItems ? record.lineItems : record.line_items;
  if (chosen == null) return true;
  return Array.isArray(chosen) && chosen.length === 0;
}

/** A page read failed at a known stage. `finishReason` is set when Gemini reported one. */
export class InvoicePageReadError extends Error {
  readonly stage: InvoicePageFailureStage;
  readonly finishReason: string | null;
  readonly lineShape: InvoicePageLineShape | null;
  constructor(
    stage: InvoicePageFailureStage,
    message: string,
    finishReason: string | null = null,
    lineShape: InvoicePageLineShape | null = null
  ) {
    super(message);
    this.name = 'InvoicePageReadError';
    this.stage = stage;
    this.finishReason = finishReason;
    this.lineShape = lineShape;
  }
}

function isInvoiceMaxTokensError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ((error as { finishReason?: unknown }).finishReason === 'MAX_TOKENS') return true;
  return error instanceof Error && error.name === 'GeminiMaxTokensError';
}

/** Gemini finishReason, or null. Only a short reason token is kept, never response text. */
export function invoicePageFinishReason(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const reason = (error as { finishReason?: unknown }).finishReason;
  if (typeof reason !== 'string' || !/^[A-Z0-9_]{1,32}$/.test(reason)) return null;
  return reason;
}

export function invoicePageFailureStage(error: unknown): InvoicePageFailureStage | null {
  if (error && typeof error === 'object') {
    const stage = (error as { stage?: unknown }).stage;
    if (typeof stage === 'string' && INVOICE_PAGE_FAILURE_STAGES.has(stage as InvoicePageFailureStage)) {
      return stage as InvoicePageFailureStage;
    }
  }
  if (isInvoiceMaxTokensError(error)) return null;
  const message = error instanceof Error ? error.message : '';
  if (isGeminiRateLimitMessage(message)) return '429';
  if (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError' || /timed out/i.test(message))
  ) {
    return 'abort';
  }
  if (error instanceof Error && error.name === 'ZodError') return 'zod';
  if (message === INVOICE_OCR_JSON_ERROR || /structured JSON/i.test(message)) return 'json';
  if (/No stock lines/i.test(message)) return 'interpret';
  return null;
}

function loggedLineShape(error: unknown): InvoicePageLineShape | null {
  if (!error || typeof error !== 'object') return null;
  const shape = (error as { lineShape?: unknown }).lineShape;
  if (!shape || typeof shape !== 'object' || Array.isArray(shape)) return null;
  const record = shape as Record<string, unknown>;
  if (
    typeof record.lineCount !== 'number' ||
    typeof record.keyCount !== 'number' ||
    typeof record.lineItemsIsArray !== 'boolean'
  ) {
    return null;
  }
  return {
    lineCount: record.lineCount,
    lineItemsIsArray: record.lineItemsIsArray,
    keyCount: record.keyCount,
  };
}

/**
 * One line per failed page. The line is the page index, finishReason, and stage.
 * An empty read logs only the page index and the line-list shape.
 * Neither line includes the model text, vendor, amounts, or any other invoice content.
 */
export function logInvoicePageReadFailure(error: unknown, pageIndex?: number): void {
  const page = pageIndex == null ? '-' : pageIndex;
  if (invoicePageFailureStage(error) === 'empty') {
    const shape = loggedLineShape(error);
    console.info(
      '[invoice-ocr] page=%s lineCount=%s lineItemsIsArray=%s keyCount=%s',
      page,
      shape?.lineCount ?? 0,
      shape?.lineItemsIsArray === true,
      shape?.keyCount ?? 0
    );
    return;
  }
  console.info(
    '[invoice-ocr] page=%s finishReason=%s stage=%s',
    page,
    invoicePageFinishReason(error) ?? 'none',
    invoicePageFailureStage(error) ?? 'none'
  );
}

export function pageFailureMessage(error: unknown): string {
  if (invoicePageFailureStage(error) === 'empty') {
    return INVOICE_PAGE_EMPTY_LINES_MESSAGE;
  }
  if (isInvoiceMaxTokensError(error)) {
    return INVOICE_PAGE_TOO_DENSE_MESSAGE;
  }
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
      ...(fact.gst !== undefined ? { gst: fact.gst } : { gst: undefined }),
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

function firstText(pages: ScanPageState[], field: 'vendorName' | 'invoiceNumber'): string {
  for (const page of pages) {
    const value = page[field]?.trim() ?? '';
    if (value) return value;
  }
  return '';
}

/** A stored page date, or null when that page did not print one. */
function parsedMergeDate(raw: string | undefined): string | null {
  const parsed = parseOcrInvoiceDate(raw ?? '').invoiceDate.trim();
  return parsed || null;
}

/** 10-11-2026 can be stored as 2026-10-11 or 2026-11-10. Those two readings are one printed date. */
function isDayMonthSwap(left: string, right: string): boolean {
  const [yearA, monthA, dayA] = left.split('-');
  const [yearB, monthB, dayB] = right.split('-');
  return Boolean(yearA && yearA === yearB && monthA === dayB && dayA === monthB && monthA !== dayA);
}

export function mergeReadPages(
  pages: ScanPageState[],
  options?: { dedupeUndone?: boolean; lineMax?: number; tolerance?: number }
): MergedInvoicePages {
  const read = [...pages].filter((page) => page.status === 'read').sort((a, b) => a.index - b.index);
  const vendorName = firstText(read, 'vendorName');
  const mergedBase = mergedPageInvoiceNumber(
    read.map((page) => ({ index: page.index, invoiceNumber: page.invoiceNumber }))
  );
  const invoiceNumber = mergedBase ?? firstText(read, 'invoiceNumber');
  const blockers: string[] = [];
  const vendorKey = normHeader(vendorName);
  const invoiceKey = normHeader(invoiceNumber);
  for (const page of read) {
    const vendor = normHeader(page.vendorName);
    const invoice = normHeader(mergedBase ?? page.invoiceNumber);
    if ((vendor && vendorKey && vendor !== vendorKey) || (invoice && invoiceKey && invoice !== invoiceKey)) {
      blockers.push(DIFFERENT_INVOICES_BLOCKER);
      break;
    }
  }

  const datedPages = read.flatMap((page) => {
    const parsed = parsedMergeDate(page.invoiceDate);
    return parsed ? [{ page, parsed }] : [];
  });
  const uniqueDates = [...new Set(datedPages.map((row) => row.parsed))];
  const invoiceDate = datedPages[0]?.parsed ?? '';
  let invoiceDateNeedsConfirm = false;
  let invoiceDateConfirmReason: string | null = null;
  const datesConflict =
    uniqueDates.length > 1 &&
    !(uniqueDates.length === 2 && isDayMonthSwap(uniqueDates[0]!, uniqueDates[1]!));
  if (datesConflict) {
    invoiceDateNeedsConfirm = true;
    invoiceDateConfirmReason = 'Pages do not agree on the invoice date. Pick the date from the paper.';
  } else if (invoiceDate) {
    const source = datedPages.find((row) => row.parsed === invoiceDate && row.page.invoiceDateNeedsConfirm);
    if (source) {
      invoiceDateNeedsConfirm = true;
      invoiceDateConfirmReason = source.page.invoiceDateConfirmReason?.trim() || null;
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
  let printedGst: number | undefined;
  const positiveSubtotals: number[] = [];
  // A repeated header subtotal is one amount. A different positive subtotal is not added in.
  for (const page of read) {
    if (typeof page.subtotal === 'number' && page.subtotal > 0) {
      positiveSubtotals.push(page.subtotal);
      totalsFromPage = page.index;
      printedSubtotal = page.subtotal;
      printedHst = page.hst;
      printedPst = page.pst;
      printedGst = page.gst;
    }
  }
  const subtotalsDisagree =
    new Set(positiveSubtotals.map((value) => Math.round(value * 100))).size > 1;

  const lineMax = options?.lineMax ?? INVOICE_PAGE_LINE_MAX;
  if (deduped.kept.length > lineMax) {
    blockers.push(`This invoice has ${deduped.kept.length} lines. ${lineMax} lines is the maximum.`);
  }

  const reviewFlags: string[] = [];
  if (subtotalsDisagree) reviewFlags.push('Pages do not agree on the printed subtotal.');
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
    ...(printedGst !== undefined ? { printedGst } : {}),
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
  if (merged.printedGst !== undefined) next.printedGst = merged.printedGst;
  else delete next.printedGst;
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
      ...(typeof page.gst === 'number' ? { gst: page.gst } : {}),
      ...(Array.isArray(page.lines) ? { lines: page.lines as InvoicePageLine[] } : {}),
    });
  }
  const subtotal = typeof record.printedSubtotal === 'number' ? record.printedSubtotal : undefined;
  const hst = typeof record.printedHst === 'number' ? record.printedHst : undefined;
  const pst = typeof record.printedPst === 'number' ? record.printedPst : undefined;
  const gst = typeof record.printedGst === 'number' ? record.printedGst : undefined;
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
    ...(gst !== undefined ? { printedGst: gst } : {}),
    pageScanBlockers: Array.isArray(record.pageScanBlockers)
      ? record.pageScanBlockers.filter((item): item is string => typeof item === 'string')
      : [],
    pageScanReviewFlags: Array.isArray(record.pageScanReviewFlags)
      ? record.pageScanReviewFlags.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

/** Wait inside the request only when Retry-After is short enough to stay on this screen. */
export const INVOICE_SCAN_RETRY_WAIT_MAX_MS = 15_000;

export class InvoiceScanRequestError extends Error {
  readonly retryAfterMs: number | null;
  /** Epoch milliseconds when Continue may run again. Null when there is nothing to wait for. */
  readonly continueAtMs: number | null;

  constructor(message: string, retryAfterMs: number | null = null, nowMs = Date.now()) {
    super(message);
    this.name = 'InvoiceScanRequestError';
    this.retryAfterMs = retryAfterMs;
    this.continueAtMs = retryAfterMs != null && retryAfterMs > 0 ? nowMs + retryAfterMs : null;
  }
}

/** Retry-After as delay milliseconds. A delta is seconds. An HTTP date is time from now. Blank is missing. */
export function parseRetryAfterDelayMs(header: string | null | undefined, nowMs = Date.now()): number | null {
  if (header == null) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const dated = Date.parse(trimmed);
  if (!Number.isNaN(dated)) return Math.max(0, dated - nowMs);
  return null;
}

export function retryAfterMessage(waitMs: number | null): string {
  if (waitMs == null || waitMs <= 0) return 'The reader is busy. Continue the scan in a moment.';
  const seconds = Math.max(1, Math.ceil(waitMs / 1000));
  return `The reader is busy. Continue scan in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`;
}

/** A short Retry-After is waited inside the request. A longer one is shown, and Continue stays off until it passes. */
export function retryAfterPlan(
  header: string | null | undefined,
  nowMs = Date.now(),
  maxWaitMs = INVOICE_SCAN_RETRY_WAIT_MAX_MS
): { waitMs: number | null; waitNow: boolean; message: string } {
  const waitMs = parseRetryAfterDelayMs(header, nowMs);
  return {
    waitMs,
    waitNow: waitMs != null && waitMs > 0 && waitMs <= maxWaitMs,
    message: retryAfterMessage(waitMs),
  };
}

export function continuablePendingIndexes(
  pages: Array<{ index: number; status: string }>,
  imageIndexes: Iterable<number>
): number[] {
  const have = new Set(imageIndexes);
  return pages
    .filter((page) => page.status === 'pending' && have.has(page.index))
    .map((page) => page.index)
    .sort((a, b) => a - b);
}

/** After a wave fails, stay on the scan when a draft or a photo for a waiting page is still here. */
export function scanStepAfterClientFailure(input: {
  hasDraft: boolean;
  continuableIndexes: number[];
}): 'scanning' | 'pages' {
  if (input.hasDraft || input.continuableIndexes.length > 0) return 'scanning';
  return 'pages';
}

/** Next indexes for the same wave loop. A finished or failed scan stops. */
export function nextRemainingIndexes(
  status: string,
  pendingIndexes: number[],
  hasImage: (index: number) => boolean
): number[] | null {
  if (status !== 'scanning') return null;
  const next = pendingIndexes.filter((index) => hasImage(index));
  return next.length > 0 ? next : null;
}

export interface PostedInvoiceDateState {
  invoiceDate: string;
  invoiceDateNeedsConfirm: boolean;
  invoiceDateConfirmReason?: string;
}

/** Date disagreement comes from the draft. A missing flag stays false. */
export function readPostedInvoiceDate(json: Record<string, unknown>): PostedInvoiceDateState {
  const data =
    json.data && typeof json.data === 'object' && !Array.isArray(json.data)
      ? (json.data as Record<string, unknown>)
      : null;
  const invoiceDate =
    typeof json.invoiceDate === 'string'
      ? json.invoiceDate
      : typeof data?.invoiceDate === 'string'
        ? data.invoiceDate
        : '';
  const reasonRaw = json.invoiceDateConfirmReason ?? data?.invoiceDateConfirmReason;
  const invoiceDateNeedsConfirm = json.invoiceDateNeedsConfirm === true || data?.invoiceDateNeedsConfirm === true;
  return {
    invoiceDate,
    invoiceDateNeedsConfirm,
    ...(typeof reasonRaw === 'string' && reasonRaw.trim() ? { invoiceDateConfirmReason: reasonRaw.trim() } : {}),
  };
}

/** The prefilled page-1 date is not a resolution. Only a picker confirm or change is. */
export function confirmInvoiceDateResolution(input: {
  dateConfirmed: boolean;
  dateDraft: string;
}): { invoiceDate: string } | undefined {
  const invoiceDate = input.dateDraft.trim();
  if (!input.dateConfirmed || !invoiceDate) return undefined;
  return { invoiceDate };
}

export function invoiceReviewHardBlocked(input: {
  blockers: string[];
  invoiceDateNeedsConfirm: boolean;
  dateConfirmed: boolean;
}): boolean {
  if (input.invoiceDateNeedsConfirm && !input.dateConfirmed) return true;
  return input.blockers.some(
    (blocker) =>
      blocker === DIFFERENT_INVOICES_BLOCKER ||
      /still being read|Retake that page|lines is the maximum|no invoice lines/i.test(blocker)
  );
}
