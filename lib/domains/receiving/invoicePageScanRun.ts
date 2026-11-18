import { Prisma } from '@prisma/client';
import { geminiBackoffMs } from '@/lib/domains/ai/gemini';
import { INVOICE_PHOTO_MAX_BYTES, INVOICE_PDF_MAX_PAGES } from '@/lib/domains/ai/invoiceScan';
import { prisma } from '@/lib/domains/inventory/ledger';
import {
  saveInvoiceOcrDraft,
  type OcrDraftLine,
  type OcrDraftPayload,
} from '@/lib/domains/receiving/invoiceOcrCommit';
import { draftPostingBlockers } from '@/lib/domains/receiving/invoiceOcrDraft';
import {
  beginPageReread,
  duplicateNoteForScan,
  finalizeReadyScan,
  initialPageScan,
  INVOICE_PAGE_BATCH_SIZE,
  markPagesScanning,
  mergeReadPages,
  nextSuppliedWave,
  nextWaveDelayMs,
  overallScanStatus,
  pageFailureMessage,
  readStoredPageScan,
  recordPageFailure,
  recordPageRead,
  settleStaleScanningPages,
  undoDedupeOnScan,
  waveFitsInRequest,
  type InvoicePageLine,
  type PageFact,
  type PageScanRecord,
} from '@/lib/domains/receiving/invoicePageScan';
import {
  invoicePageRetryBodySchema,
  invoicePageScanBodySchema,
  invoicePageUndoBodySchema,
} from '@/lib/security/schemas/invoiceOcr';

export interface InvoicePageImage {
  index: number;
  imageBase64: string;
  mimeType?: string;
}

export interface InvoicePageScanRunner {
  staffId: string;
  body: unknown;
  now?: Date;
  readPage: (page: InvoicePageImage) => Promise<PageFact>;
  /** Catalog match and the authoritative draft. Called once every page has been read, and again after undo. */
  auditLines: (scan: PageScanRecord, lines: InvoicePageLine[]) => Promise<OcrDraftPayload>;
}

type ScanResponse = { status: number; body: Record<string, unknown> };

function draftLinesOf(payload: unknown): OcrDraftLine[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const lines = (payload as { lines?: unknown }).lines;
  return Array.isArray(lines) ? (lines as OcrDraftLine[]) : [];
}

function iso(now: Date): string {
  return now.toISOString();
}

function imageTooLarge(page: InvoicePageImage): string | null {
  const mime = page.mimeType || 'image/jpeg';
  const pdf = /application\/pdf/i.test(mime) || page.imageBase64.includes('JVBERi0');
  const limit = pdf ? Math.ceil((INVOICE_PHOTO_MAX_BYTES * 4) / 3) + 64 : 2_000_000;
  if (page.imageBase64.length > limit) {
    return pdf
      ? 'This PDF is too large. Send a smaller file.'
      : 'Invoice photo is too large. Use a closer crop and try again.';
  }
  return null;
}

function scanPayload(scan: PageScanRecord, lines: OcrDraftLine[]): OcrDraftPayload {
  return {
    vendorName: scan.vendorName,
    invoiceNumber: scan.invoiceNumber,
    invoiceDate: scan.invoiceDate,
    ...(scan.invoiceDateNeedsConfirm
      ? {
          invoiceDateNeedsConfirm: true,
          ...(scan.invoiceDateConfirmReason ? { invoiceDateConfirmReason: scan.invoiceDateConfirmReason } : {}),
        }
      : {}),
    totalAmount: scan.totalAmount,
    departmentBreakdown: scan.departmentBreakdown,
    lines,
    scanStatus: scan.scanStatus,
    scanAudited: scan.scanAudited,
    clientScanId: scan.clientScanId,
    pageCount: scan.pageCount,
    scanPages: scan.scanPages,
    dedupedCount: scan.dedupedCount,
    dedupedFrom: scan.dedupedFrom,
    dedupeUndone: scan.dedupeUndone,
    totalsFromPage: scan.totalsFromPage,
    ...(scan.printedSubtotal !== undefined ? { printedSubtotal: scan.printedSubtotal } : {}),
    ...(scan.printedHst !== undefined ? { printedHst: scan.printedHst } : {}),
    ...(scan.printedPst !== undefined ? { printedPst: scan.printedPst } : {}),
    pageScanBlockers: scan.pageScanBlockers,
    pageScanReviewFlags: scan.pageScanReviewFlags,
  };
}

function printedTotal(scan: PageScanRecord, fallback: number): number {
  if (typeof scan.printedSubtotal !== 'number') return fallback;
  const hst = typeof scan.printedHst === 'number' ? scan.printedHst : 0;
  const pst = typeof scan.printedPst === 'number' ? scan.printedPst : 0;
  return Number((scan.printedSubtotal + hst + pst).toFixed(2));
}

async function persist(id: string, payload: OcrDraftPayload): Promise<void> {
  const json = JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
  await prisma.invoiceOcrDraft.update({
    where: { id },
    data: { payload: json },
  });
}

async function loadOwned(staffId: string, draftId: string) {
  const row = await prisma.invoiceOcrDraft.findFirst({
    where: { id: draftId, staffId },
    select: { id: true, payload: true, consumedAt: true, expiresAt: true },
  });
  return row;
}

function responseFor(draftId: string, payload: OcrDraftPayload): ScanResponse {
  const scan = readStoredPageScan(payload);
  const status = scan?.scanStatus ?? 'scanning';
  const http = status === 'scanning' ? 202 : 200;
  const blockers = draftPostingBlockers(payload, { actorIsManager: false, manualReviewOverride: false });
  const pages = (scan?.scanPages ?? []).map((page) => ({
    index: page.index,
    status: page.status,
    ...(page.error ? { error: page.error } : {}),
  }));
  const body: Record<string, unknown> = {
    success: true,
    draftId,
    status,
    pageCount: scan?.pageCount ?? payload.pageCount ?? pages.length,
    pages,
    dedupedCount: scan?.dedupedCount ?? 0,
    dedupedFrom: scan?.dedupedFrom ?? [],
    totalsFromPage: scan?.totalsFromPage ?? null,
    pendingIndexes: pages.filter((page) => page.status === 'pending').map((page) => page.index),
    blockers,
    reviewFlags: scan?.pageScanReviewFlags ?? [],
    duplicateNote: scan ? duplicateNoteForScan(scan) : '',
    ...(scan?.printedSubtotal !== undefined ? { printedSubtotal: scan.printedSubtotal } : {}),
    ...(scan?.printedHst !== undefined ? { printedHst: scan.printedHst } : {}),
    ...(scan?.printedPst !== undefined ? { printedPst: scan.printedPst } : {}),
  };
  if (status === 'ready' && payload.scanAudited) {
    body.data = {
      vendorName: payload.vendorName,
      invoiceNumber: payload.invoiceNumber,
      invoiceDate: payload.invoiceDate,
      totalAmount: payload.totalAmount,
      departmentBreakdown: payload.departmentBreakdown,
      draftId,
      lineItems: payload.lines.map((line, index) => ({
        name: line.line_name?.trim() || `Unread line ${index + 1}`,
        department: line.department ?? 'PRODUCE',
        quantity: line.quantity,
        unit: line.unit || (line.quantity_kind === 'cases' ? 'cases' : 'units'),
        casePackSize: line.case_pack_size ?? 1,
        subUnit: 'units',
        unitCost: line.unit_cost,
        totalCost: Number(((line.quantity > 0 ? line.quantity : 0) * line.unit_cost).toFixed(2)),
        page: line.page,
        productId: line.product_id || null,
        lineConfidence: line.line_confidence,
        needsManualReview:
          line.requires_approval === true ||
          line.quantity_unreadable === true ||
          line.cost_unreadable === true ||
          line.name_unreadable === true,
        requires_approval: line.requires_approval,
      })),
    };
  }
  return { status: http, body };
}

async function auditAndSave(
  runner: InvoicePageScanRunner,
  draftId: string,
  scan: PageScanRecord
): Promise<OcrDraftPayload> {
  const finalized = finalizeReadyScan(scan);
  const merged = mergeReadPages(finalized.scanPages, {
    dedupeUndone: finalized.dedupeUndone,
  });
  const audited = await runner.auditLines(finalized, merged.lines);
  const lines = audited.lines.map((line, index) => {
    const source = merged.lines[index];
    return {
      ...line,
      ...(source?.page ? { page: source.page } : {}),
      ...(source?.code ? { code: source.code } : {}),
      ...(source?.unit ? { unit: source.unit } : {}),
    };
  });
  const payload = scanPayload(
    {
      ...finalized,
      scanStatus: 'ready',
      scanAudited: true,
      totalAmount: printedTotal(finalized, audited.totalAmount),
      departmentBreakdown: audited.departmentBreakdown,
    },
    lines
  );
  payload.vendorName = finalized.vendorName || audited.vendorName;
  payload.invoiceNumber = finalized.invoiceNumber || audited.invoiceNumber;
  payload.invoiceDate = finalized.invoiceDate || audited.invoiceDate;
  await persist(draftId, payload);
  return payload;
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      const item = items[index];
      if (item !== undefined) await fn(item);
    }
  });
  await Promise.all(workers);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readWave(
  runner: InvoicePageScanRunner,
  draftId: string,
  scan: PageScanRecord,
  images: Map<number, InvoicePageImage>,
  startedAtMs: number,
  lines: OcrDraftLine[]
): Promise<{ scan: PageScanRecord; lines: OcrDraftLine[] }> {
  let current = scan;
  let currentLines = lines;
  let rateLimited = false;
  let chain = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };

  while (waveFitsInRequest(Date.now(), startedAtMs)) {
    if (rateLimited) {
      const wait = nextWaveDelayMs(true, geminiBackoffMs);
      if (!waveFitsInRequest(Date.now() + wait, startedAtMs)) break;
      await sleep(wait);
      rateLimited = false;
    }
    current = settleStaleScanningPages(current, Date.now());
    const wave = nextSuppliedWave(
      current.scanPages,
      [...images.keys()],
      INVOICE_PAGE_BATCH_SIZE
    );
    if (wave.length === 0) break;
    const marked = markPagesScanning(current, wave.map((page) => page.index), iso(new Date()));
    current = marked.scan;
    await persist(draftId, scanPayload(current, currentLines));
    let waveLimited = false;
    await mapPool(wave, INVOICE_PAGE_BATCH_SIZE, async (page) => {
      const image = images.get(page.index);
      const attempt = marked.attempts[page.index];
      if (!image || attempt == null) return;
      let fact: PageFact | null = null;
      let failure = 'This page could not be read. Retry it or take another photo.';
      let limited = false;
      try {
        fact = await runner.readPage({ ...image, index: page.index });
      } catch (error) {
        failure = pageFailureMessage(error);
        limited = isRateLimited(error);
      }
      await exclusive(async () => {
        const row = await loadOwned(runner.staffId, draftId);
        const fresh = row ? readStoredPageScan(row.payload) : null;
        const base = fresh ?? current;
        const next = fact
          ? recordPageRead(base, page.index, attempt, fact, iso(new Date()))
          : recordPageFailure(base, page.index, attempt, failure, iso(new Date()));
        const keptLines = row ? draftLinesOf(row.payload) : currentLines;
        await persist(draftId, scanPayload(next, Array.isArray(keptLines) ? keptLines : []));
        current = next;
        if (limited) waveLimited = true;
      });
    });
    rateLimited = waveLimited;
    const reloaded = await loadOwned(runner.staffId, draftId);
    const stored = reloaded ? readStoredPageScan(reloaded.payload) : null;
    if (stored) current = stored;
    if (reloaded) currentLines = draftLinesOf(reloaded.payload);
  }
  return { scan: current, lines: currentLines };
}

function isRateLimited(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return /\b429\b|RESOURCE_EXHAUSTED|rate limit/i.test(message);
}

async function finishIfReady(
  runner: InvoicePageScanRunner,
  draftId: string,
  scan: PageScanRecord,
  lines: OcrDraftLine[]
): Promise<OcrDraftPayload> {
  if (overallScanStatus(scan.scanPages) !== 'ready') {
    const payload = scanPayload(scan, lines);
    await persist(draftId, payload);
    return payload;
  }
  return auditAndSave(runner, draftId, scan);
}

export function isInvoicePageScanRequest(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const body = raw as Record<string, unknown>;
  if (body.retryPage === true || body.undoDedupe === true) return true;
  return typeof body.clientScanId === 'string' && body.clientScanId.trim().length > 0;
}

export async function runInvoicePageScan(runner: InvoicePageScanRunner): Promise<ScanResponse> {
  const now = runner.now ?? new Date();
  if (runner.body && typeof runner.body === 'object' && (runner.body as { undoDedupe?: boolean }).undoDedupe === true) {
    return undoScan(runner, now);
  }
  if (runner.body && typeof runner.body === 'object' && (runner.body as { retryPage?: boolean }).retryPage === true) {
    return retryScan(runner, now);
  }
  return continueScan(runner, now);
}

async function continueScan(runner: InvoicePageScanRunner, now: Date): Promise<ScanResponse> {
  const body = invoicePageScanBodySchema.parse(runner.body);
  if (body.pageCount > INVOICE_PDF_MAX_PAGES) {
    return {
      status: 400,
      body: { success: false, error: `This PDF has too many pages. Send ${INVOICE_PDF_MAX_PAGES} pages or fewer.` },
    };
  }
  for (const page of body.pages) {
    const tooBig = imageTooLarge(page);
    if (tooBig) return { status: 413, body: { success: false, error: tooBig } };
  }

  const existing = await findByClientScan(runner.staffId, body.clientScanId, now);
  if (existing?.consumedAt) {
    return { status: 409, body: { success: false, error: 'This scan was already received.' } };
  }
  let draftId: string;
  let scan: PageScanRecord;
  let lines: OcrDraftLine[] = [];
  if (existing) {
    const stored = readStoredPageScan(existing.payload);
    if (!stored) {
      return { status: 409, body: { success: false, error: 'That scan could not be continued. Start it again.' } };
    }
    if (stored.pageCount !== body.pageCount) {
      return { status: 409, body: { success: false, error: 'That scan is for a different number of pages.' } };
    }
    draftId = existing.id;
    scan = settleStaleScanningPages(stored, now.getTime());
    lines = draftLinesOf(existing.payload);
  } else {
    scan = initialPageScan(body.clientScanId, body.pageCount, iso(now));
    const created = await saveInvoiceOcrDraft(runner.staffId, scanPayload(scan, []));
    draftId = created.id;
  }

  const images = new Map(body.pages.map((page) => [page.index, page]));
  const wave = await readWave(runner, draftId, scan, images, now.getTime(), lines);
  const payload = await finishIfReady(runner, draftId, wave.scan, wave.lines);
  return responseFor(draftId, payload);
}

async function retryScan(runner: InvoicePageScanRunner, now: Date): Promise<ScanResponse> {
  const body = invoicePageRetryBodySchema.parse(runner.body);
  const tooBig = imageTooLarge(body.page);
  if (tooBig) return { status: 413, body: { success: false, error: tooBig } };
  const row = await loadOwned(runner.staffId, body.draftId);
  if (!row) return { status: 404, body: { success: false, error: 'Invoice scan was not found. Scan the invoice again.' } };
  if (row.consumedAt) return { status: 409, body: { success: false, error: 'This scan was already received.' } };
  if (row.expiresAt.getTime() < now.getTime()) {
    return { status: 409, body: { success: false, error: 'Invoice scan expired. Scan the invoice again.' } };
  }
  const stored = readStoredPageScan(row.payload);
  if (!stored) return { status: 409, body: { success: false, error: 'That scan could not be continued. Start it again.' } };
  const settled = settleStaleScanningPages(stored, now.getTime());
  const begun = beginPageReread(settled, body.page.index, iso(now), now.getTime());
  if (!begun.ok) return { status: 409, body: { success: false, error: begun.error } };
  await persist(row.id, scanPayload(begun.scan, []));
  let fact: PageFact | null = null;
  let failure = 'This page could not be read. Retry it or take another photo.';
  try {
    fact = await runner.readPage(body.page);
  } catch (error) {
    failure = pageFailureMessage(error);
    if (isRateLimited(error)) {
      const wait = nextWaveDelayMs(true, geminiBackoffMs);
      await sleep(wait);
      try {
        fact = await runner.readPage(body.page);
        failure = '';
      } catch (again) {
        failure = pageFailureMessage(again);
      }
    }
  }
  const next = fact
    ? recordPageRead(begun.scan, body.page.index, begun.attempt, fact, iso(new Date()))
    : recordPageFailure(begun.scan, body.page.index, begun.attempt, failure, iso(new Date()));
  const payload = await finishIfReady(runner, row.id, next, []);
  return responseFor(row.id, payload);
}

async function undoScan(runner: InvoicePageScanRunner, now: Date): Promise<ScanResponse> {
  const body = invoicePageUndoBodySchema.parse(runner.body);
  const row = await loadOwned(runner.staffId, body.draftId);
  if (!row) return { status: 404, body: { success: false, error: 'Invoice scan was not found. Scan the invoice again.' } };
  if (row.consumedAt) return { status: 409, body: { success: false, error: 'This scan was already received.' } };
  if (row.expiresAt.getTime() < now.getTime()) {
    return { status: 409, body: { success: false, error: 'Invoice scan expired. Scan the invoice again.' } };
  }
  const stored = readStoredPageScan(row.payload);
  if (!stored || stored.scanStatus !== 'ready') {
    return { status: 409, body: { success: false, error: 'Duplicates can be restored after every page has been read.' } };
  }
  const undone = undoDedupeOnScan(stored);
  const payload = await auditAndSave(runner, row.id, undone);
  return responseFor(row.id, payload);
}

async function findByClientScan(staffId: string, clientScanId: string, now: Date) {
  const rows = await prisma.invoiceOcrDraft.findMany({
    where: { staffId, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: { id: true, payload: true, consumedAt: true, expiresAt: true },
  });
  return (
    rows.find((row) => {
      const payload = row.payload;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
      return (payload as { clientScanId?: unknown }).clientScanId === clientScanId;
    }) ?? null
  );
}
