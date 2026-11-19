import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { geminiBackoffMs } from '@/lib/domains/ai/gemini';
import { INVOICE_OCR_TOTAL_BUDGET_MS, INVOICE_PDF_MAX_PAGES } from '@/lib/domains/ai/invoiceScan';
import { INVOICE_LINE_TOTAL_TOLERANCE } from '@/lib/domains/receiving/invoiceOcrModel';
import { draftPostingBlockers } from '@/lib/domains/receiving/invoiceOcrDraft';
import type { OcrDraftPayload } from '@/lib/domains/receiving/invoiceOcrCommit';
import { MAX_RECEIVING_BATCH_SIZE } from '@/lib/domains/receiving/receivingLogPost';
import { invoiceResultFromStoredDraft, pickOpenInvoiceScan } from '@/lib/domains/receiving/openInvoiceScan';
import { invoicePageScanBodySchema } from '@/lib/security/schemas/invoiceOcr';
import {
  beginPageReread,
  chunkPages,
  confirmInvoiceDateResolution,
  continuablePendingIndexes,
  createScanPages,
  dedupeCrossPageLines,
  DIFFERENT_INVOICES_BLOCKER,
  duplicateRemovalNote,
  finalizeReadyScan,
  initialPageScan,
  INVOICE_PAGE_ATTEMPT_BUDGET_MS,
  InvoiceScanRequestError,
  invoiceReviewHardBlocked,
  INVOICE_PAGE_BATCH_SIZE,
  INVOICE_PAGE_LINE_MAX,
  INVOICE_PAGE_MAX,
  INVOICE_PAGE_REQUEST_BUDGET_MS,
  INVOICE_PAGE_STALE_MS,
  INVOICE_PAGE_TOTAL_TOLERANCE,
  lineIdentityKey,
  markPagesScanning,
  mergeReadPages,
  nextRemainingIndexes,
  nextSuppliedWave,
  nextWaveDelayMs,
  parseRetryAfterDelayMs,
  readOptionalMoney,
  readPostedInvoiceDate,
  readPrintedMoneyFields,
  retryAfterPlan,
  readStoredPageScan,
  recordPageFailure,
  recordPageRead,
  scanStepAfterClientFailure,
  settleStaleScanningPages,
  undoCrossPageDedupe,
  undoDedupeOnScan,
  waveFitsInRequest,
  type InvoicePageLine,
  type PageFact,
} from '@/lib/domains/receiving/invoicePageScan';

const NOW = '2026-11-18T12:00:00.000Z';
const NOW_MS = Date.parse(NOW);

function line(partial: Partial<InvoicePageLine> & Pick<InvoicePageLine, 'page' | 'name'>): InvoicePageLine {
  return {
    unit: 'cases',
    department: 'PRODUCE',
    casePackSize: 1,
    subUnit: 'units',
    quantity: 1,
    unitCost: 2,
    totalCost: 2,
    ...partial,
  };
}

function fact(partial: Partial<PageFact> & Pick<PageFact, 'lines'>): PageFact {
  return {
    vendorName: 'Ontario Fresh Produce',
    invoiceNumber: 'INV-48211',
    invoiceDate: '2026-11-13',
    invoiceDateNeedsConfirm: false,
    invoiceDateConfirmReason: null,
    ...partial,
  };
}

function readAll(scan = initialPageScan('11111111-1111-4111-8111-111111111111', 3, NOW), facts?: PageFact[]) {
  let current = scan;
  const pages = facts ?? [
    fact({ lines: [line({ page: 1, name: 'Romaine hearts', quantity: 3, unitCost: 38, totalCost: 114 })] }),
    fact({ lines: [line({ page: 2, name: 'Roma tomatoes', quantity: 4, unitCost: 23, totalCost: 92 })] }),
    fact({
      lines: [line({ page: 3, name: 'Whole milk', quantity: 12, unit: 'units', unitCost: 5.4, totalCost: 64.8 })],
      subtotal: 270.8,
      hst: 35.2,
    }),
  ];
  pages.forEach((pageFact, index) => {
    const marked = markPagesScanning(current, [index + 1], NOW);
    current = recordPageRead(marked.scan, index + 1, marked.attempts[index + 1]!, pageFact, NOW);
  });
  return current;
}

test('page waves stay inside the 60 second route and match the existing OCR limits', () => {
  const route = fs.readFileSync(path.join(process.cwd(), 'app/api/invoice-ocr/route.ts'), 'utf8');
  assert.match(route, /export const maxDuration = 60;/);
  assert.equal(INVOICE_PAGE_MAX, INVOICE_PDF_MAX_PAGES);
  assert.equal(INVOICE_PAGE_MAX, 8);
  assert.equal(INVOICE_PAGE_BATCH_SIZE, 3);
  assert.equal(INVOICE_PAGE_ATTEMPT_BUDGET_MS, INVOICE_OCR_TOTAL_BUDGET_MS);
  assert.equal(INVOICE_PAGE_TOTAL_TOLERANCE, INVOICE_LINE_TOTAL_TOLERANCE);
  assert.equal(INVOICE_PAGE_LINE_MAX, MAX_RECEIVING_BATCH_SIZE);
  assert.ok(INVOICE_PAGE_REQUEST_BUDGET_MS < 60_000);
  assert.ok(INVOICE_PAGE_ATTEMPT_BUDGET_MS < INVOICE_PAGE_REQUEST_BUDGET_MS);
  assert.ok(60_000 - INVOICE_PAGE_REQUEST_BUDGET_MS >= 10_000);

  assert.deepEqual(
    chunkPages([1, 2, 3, 4, 5, 6, 7, 8], INVOICE_PAGE_BATCH_SIZE),
    [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8],
    ]
  );
  assert.deepEqual(chunkPages([1, 2], 2), [[1, 2]]);
  assert.equal(waveFitsInRequest(0, 0), true);
  assert.equal(waveFitsInRequest(24_000, 0), false);
  assert.equal(waveFitsInRequest(20_000, 0), true);

  const pages = createScanPages(8, NOW);
  pages[0] = { ...pages[0]!, status: 'read' };
  pages[1] = { ...pages[1]!, status: 'failed' };
  assert.deepEqual(
    nextSuppliedWave(pages, [1, 2, 3, 4]).map((page) => page.index),
    [3, 4]
  );
  assert.equal(nextWaveDelayMs(false, geminiBackoffMs, 0), 0);
  assert.equal(nextWaveDelayMs(true, geminiBackoffMs, 0), geminiBackoffMs(null, 0));
});

test('a failed page can be retaken without reading the pages that already succeeded', () => {
  let scan = initialPageScan('22222222-2222-4222-8222-222222222222', 3, NOW);
  const first = markPagesScanning(scan, [1, 2], NOW);
  scan = recordPageRead(first.scan, 1, first.attempts[1]!, fact({ lines: [line({ page: 1, name: 'Romaine' })] }), NOW);
  scan = recordPageFailure(scan, 2, first.attempts[2]!, 'The reader was rate limited. Retry this page in a moment.', NOW);
  assert.equal(scan.scanPages[0]?.status, 'read');
  assert.equal(scan.scanPages[1]?.status, 'failed');
  assert.equal(scan.scanPages[2]?.status, 'pending');
  assert.equal(scan.scanStatus, 'scanning');

  const refused = beginPageReread(scan, 1, NOW, NOW_MS);
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.match(refused.error, /already read/);

  const busy = markPagesScanning(scan, [3], NOW);
  const inFlight = beginPageReread(busy.scan, 3, NOW, NOW_MS);
  assert.equal(inFlight.ok, false);

  const retake = beginPageReread(scan, 2, NOW, NOW_MS);
  assert.equal(retake.ok, true);
  if (!retake.ok) return;
  assert.equal(retake.scan.scanPages[0]?.status, 'read');
  assert.equal(retake.scan.scanPages[0]?.lines?.[0]?.name, 'Romaine');
  assert.equal(retake.scan.scanPages[1]?.status, 'scanning');
  assert.equal(retake.scan.scanPages[1]?.lines, undefined);
  assert.equal(retake.attempt, 2);

  const stale = settleStaleScanningPages(retake.scan, NOW_MS + INVOICE_PAGE_STALE_MS);
  assert.equal(stale.scanPages[1]?.status, 'failed');
  assert.match(stale.scanPages[1]?.error ?? '', /Retake this page/);
  assert.equal(stale.scanPages[0]?.status, 'read');

  const late = recordPageRead(
    stale,
    2,
    retake.attempt,
    fact({ lines: [line({ page: 2, name: 'Milk' })] }),
    NOW
  );
  assert.equal(late.scanPages[1]?.status, 'read');
  assert.equal(late.scanPages[1]?.lines?.[0]?.name, 'Milk');

  const ignored = recordPageFailure(late, 2, retake.attempt - 1, 'old failure', NOW);
  assert.equal(ignored.scanPages[1]?.status, 'read');
});

test('cross-page duplicates are removed and undo puts them back', () => {
  const romaine = line({ page: 1, name: 'Romaine hearts', code: 'RH', quantity: 3, unitCost: 38, totalCost: 114 });
  const repeated = line({ page: 2, name: 'romaine   hearts', code: 'RH', quantity: 3, unitCost: 38, totalCost: 114 });
  const samePage = line({ page: 1, name: 'Romaine hearts', code: 'RH', quantity: 3, unitCost: 38, totalCost: 114 });
  const differentQty = line({ page: 2, name: 'Romaine hearts', code: 'RH', quantity: 4, unitCost: 38, totalCost: 152 });
  const blankQty = line({ page: 2, name: 'Romaine hearts', code: 'RH', quantity: undefined, unitCost: 38, totalCost: 114 });
  const zeroQty = line({ page: 3, name: 'Romaine hearts', code: 'RH', quantity: 0, unitCost: 38, totalCost: 0 });

  assert.equal(lineIdentityKey(blankQty), null);
  assert.notEqual(lineIdentityKey(blankQty), lineIdentityKey(zeroQty));

  const deduped = dedupeCrossPageLines([samePage, romaine, repeated, differentQty, blankQty]);
  assert.equal(deduped.dedupedCount, 1);
  assert.deepEqual(deduped.dedupedFrom, [1, 2]);
  assert.equal(deduped.kept.filter((item) => item.page === 1).length, 2);
  assert.equal(deduped.removed[0]?.page, 2);
  assert.equal(duplicateRemovalNote(deduped.dedupedCount, deduped.dedupedFrom), '1 duplicate removed (repeated on pages 1–2)');
  assert.equal(
    duplicateRemovalNote(2, [1, 2]),
    '2 duplicates removed (repeated on pages 1–2)'
  );

  const restored = undoCrossPageDedupe(deduped.kept, deduped.removed);
  assert.equal(restored.dedupedCount, 0);
  assert.equal(restored.removed.length, 0);
  assert.equal(restored.kept.length, 5);
  assert.equal(undoCrossPageDedupe(restored.kept, []).dedupedCount, 0);

  const scan = readAll(initialPageScan('33333333-3333-4333-8333-333333333333', 2, NOW), [
    fact({ lines: [romaine] }),
    fact({ lines: [repeated, differentQty], subtotal: 266 }),
  ]);
  const ready = finalizeReadyScan(scan);
  assert.equal(ready.scanStatus, 'ready');
  assert.equal(ready.dedupedCount, 1);
  assert.equal(ready.totalsFromPage, 2);
  assert.equal(ready.printedSubtotal, 266);
  assert.equal(ready.printedHst, undefined);

  const undone = undoDedupeOnScan(ready);
  assert.equal(undone.dedupeUndone, true);
  assert.equal(undone.dedupedCount, 0);
  const merged = mergeReadPages(undone.scanPages, { dedupeUndone: true });
  assert.equal(merged.lines.length, 3);
  assert.equal(merged.dedupedCount, 0);
});

test('blank money stays undefined and the last non-zero subtotal wins', () => {
  assert.equal(readOptionalMoney(''), undefined);
  assert.equal(readOptionalMoney('   '), undefined);
  assert.equal(readOptionalMoney(null), undefined);
  assert.equal(readOptionalMoney(undefined), undefined);
  assert.equal(readOptionalMoney('abc'), undefined);
  assert.equal(readOptionalMoney(0), 0);
  assert.equal(readOptionalMoney('0'), 0);
  assert.equal(readOptionalMoney('12.50'), 12.5);
  assert.deepEqual(readPrintedMoneyFields({ subtotal: '', hst: '1.00', pst: null }), { hst: 1 });

  const blankIndex = invoicePageScanBodySchema.safeParse({
    clientScanId: '44444444-4444-4444-8444-444444444444',
    pageCount: '',
    pages: [{ index: 1, imageBase64: 'abc' }],
  });
  assert.equal(blankIndex.success, false);

  const scan = readAll(initialPageScan('55555555-5555-4555-8555-555555555555', 3, NOW), [
    fact({ lines: [line({ page: 1, name: 'Apples', totalCost: 10 })], subtotal: undefined }),
    fact({ lines: [line({ page: 2, name: 'Pears', totalCost: 5 })], subtotal: 0, hst: 0 }),
    fact({ lines: [line({ page: 3, name: 'Milk', totalCost: 4 })], subtotal: 19, hst: undefined, pst: 1 }),
  ]);
  const merged = mergeReadPages(scan.scanPages);
  assert.equal(merged.totalsFromPage, 3);
  assert.equal(merged.printedSubtotal, 19);
  assert.equal(merged.printedHst, undefined);
  assert.equal(merged.printedPst, 1);
  assert.equal(merged.pageScanReviewFlags.length, 0);

  const conflict = mergeReadPages([
    { ...createScanPages(2, NOW)[0]!, status: 'read', vendorName: 'Ontario Fresh', invoiceNumber: 'INV-1', lines: [] },
    { ...createScanPages(2, NOW)[1]!, status: 'read', vendorName: 'Other Farm', invoiceNumber: 'INV-9', lines: [] },
  ]);
  assert.deepEqual(conflict.pageScanBlockers, [DIFFERENT_INVOICES_BLOCKER]);

  const mismatch = mergeReadPages([
    {
      ...createScanPages(1, NOW)[0]!,
      status: 'read',
      vendorName: 'Ontario Fresh',
      invoiceNumber: 'INV-1',
      invoiceDate: '2026-11-13',
      subtotal: 50,
      lines: [line({ page: 1, name: 'Apples', totalCost: 40 })],
    },
  ]);
  assert.match(mismatch.pageScanReviewFlags[0] ?? '', /subtotal 50.00 does not match the line sum 40.00/);

  const tooMany = mergeReadPages([
    {
      ...createScanPages(1, NOW)[0]!,
      status: 'read',
      vendorName: 'Ontario Fresh',
      invoiceNumber: 'INV-1',
      invoiceDate: '2026-11-13',
      lines: Array.from({ length: INVOICE_PAGE_LINE_MAX + 1 }, (_, index) =>
        line({ page: 1, name: `Item ${index}`, quantity: index + 1, totalCost: index + 1, unitCost: 1 })
      ),
    },
  ]);
  assert.match(tooMany.pageScanBlockers.join(' '), /maximum/);
});

test('a scanning draft is restored and cannot be confirmed until it is audited', () => {
  const stored = readStoredPageScan({
    ...initialPageScan('66666666-6666-4666-8666-666666666666', 2, NOW),
    lines: [],
  });
  assert.ok(stored);
  assert.equal(stored?.scanPages.length, 2);

  const row = {
    id: 'draft-pages',
    staffId: 'clerk-1',
    createdAt: new Date(NOW),
    expiresAt: new Date(NOW_MS + 60_000),
    consumedAt: null,
    payload: {
      ...initialPageScan('66666666-6666-4666-8666-666666666666', 2, NOW),
      lines: [],
    },
  };
  assert.equal(pickOpenInvoiceScan([row], 'clerk-1', new Date(NOW))?.id, 'draft-pages');
  const restored = invoiceResultFromStoredDraft(row);
  assert.equal(restored?.pageScan?.scanStatus, 'scanning');
  assert.equal(restored?.lineItems.length, 0);
  assert.equal(invoiceResultFromStoredDraft({ id: 'empty', payload: { lines: [] } }), null);

  const payload: OcrDraftPayload = {
    vendorName: 'Ontario Fresh',
    invoiceNumber: 'INV-1',
    invoiceDate: '2026-11-13',
    totalAmount: 10,
    departmentBreakdown: { PRODUCE: 10 },
    lines: [
      {
        product_id: 'romaine',
        quantity: 1,
        unit_cost: 10,
        line_name: 'Romaine',
        department: 'PRODUCE',
        line_confidence: 0.95,
        requires_approval: false,
      },
    ],
    scanStatus: 'scanning',
    scanAudited: false,
  };
  assert.match(draftPostingBlockers(payload, { actorIsManager: false, manualReviewOverride: false }).join(' '), /still being read/);
});

test('a later wave failure keeps read pages and Continue sends the pending photos', () => {
  const pages = [
    { index: 1, status: 'read' },
    { index: 2, status: 'read' },
    { index: 3, status: 'read' },
    { index: 4, status: 'pending' },
    { index: 5, status: 'pending' },
    { index: 6, status: 'pending' },
    { index: 7, status: 'pending' },
    { index: 8, status: 'failed' },
  ];
  const photos = [1, 2, 3, 4, 5, 6, 7];
  const pending = continuablePendingIndexes(pages, photos);
  assert.deepEqual(pending, [4, 5, 6, 7]);
  assert.equal(scanStepAfterClientFailure({ hasDraft: true, continuableIndexes: pending }), 'scanning');
  assert.equal(scanStepAfterClientFailure({ hasDraft: false, continuableIndexes: [] }), 'pages');
  assert.deepEqual(chunkPages(pending, INVOICE_PAGE_BATCH_SIZE), [
    [4, 5, 6],
    [7],
  ]);
  assert.deepEqual(
    nextRemainingIndexes('scanning', [7, 8], (index) => photos.includes(index)),
    [7]
  );
  assert.equal(nextRemainingIndexes('failed', [7], () => true), null);
  assert.equal(nextRemainingIndexes('ready', [], () => true), null);
  assert.deepEqual(continuablePendingIndexes([{ index: 8, status: 'failed' }], [8]), []);

  const sheet = fs.readFileSync(path.join(process.cwd(), 'components/features/receive/InvoicePageScanSheet.tsx'), 'utf8');
  const noteAt = sheet.indexOf('view.duplicateNote');
  const supplierAt = sheet.indexOf('<SupplierSelect');
  assert.ok(noteAt > 0 && supplierAt > noteAt);
  assert.match(sheet, /Continue scan/);
  assert.match(sheet, /retryAfterPlan\(response\.headers\.get\('Retry-After'\)\)/);
});

test('Retry-After is waited when it is short and shown when it is long', () => {
  const now = Date.parse('2026-11-18T12:00:00.000Z');
  assert.equal(parseRetryAfterDelayMs(null, now), null);
  assert.equal(parseRetryAfterDelayMs('   ', now), null);
  assert.equal(parseRetryAfterDelayMs('nope', now), null);
  assert.equal(parseRetryAfterDelayMs('3', now), 3_000);
  assert.equal(parseRetryAfterDelayMs(new Date(now + 12_000).toUTCString(), now), 12_000);
  const short = retryAfterPlan('3', now);
  assert.equal(short.waitNow, true);
  assert.equal(short.waitMs, 3_000);
  assert.match(short.message, /3 seconds/);
  const long = retryAfterPlan('120', now);
  assert.equal(long.waitNow, false);
  assert.equal(long.waitMs, 120_000);
  assert.match(long.message, /120 seconds/);
  assert.equal(new InvoiceScanRequestError(long.message, long.waitMs, now).retryAfterMs, 120_000);
  assert.equal(new InvoiceScanRequestError(long.message, long.waitMs, now).continueAtMs, now + 120_000);
  assert.equal(new InvoiceScanRequestError('busy', null, now).continueAtMs, null);
});

test('a date disagreement stays until the clerk confirms the picker', () => {
  const posted = readPostedInvoiceDate({
    invoiceDate: '2026-11-13',
    invoiceDateNeedsConfirm: true,
    invoiceDateConfirmReason: 'Pages do not agree on the invoice date. Pick the date from the paper.',
    data: { invoiceDate: '2026-11-01', invoiceDateNeedsConfirm: false },
  });
  assert.equal(posted.invoiceDate, '2026-11-13');
  assert.equal(posted.invoiceDateNeedsConfirm, true);
  assert.match(posted.invoiceDateConfirmReason ?? '', /do not agree/);
  assert.equal(readPostedInvoiceDate({ data: { invoiceDate: '2026-11-13' } }).invoiceDateNeedsConfirm, false);
  const fromDraft = readPostedInvoiceDate({
    data: { invoiceDate: '2026-11-13', invoiceDateNeedsConfirm: true, invoiceDateConfirmReason: 'Pages do not agree on the invoice date.' },
  });
  assert.equal(fromDraft.invoiceDateNeedsConfirm, true);
  assert.equal(fromDraft.invoiceDate, '2026-11-13');

  assert.equal(confirmInvoiceDateResolution({ dateConfirmed: false, dateDraft: '2026-11-13' }), undefined);
  assert.deepEqual(confirmInvoiceDateResolution({ dateConfirmed: true, dateDraft: ' 2026-11-13 ' }), {
    invoiceDate: '2026-11-13',
  });
  assert.equal(confirmInvoiceDateResolution({ dateConfirmed: true, dateDraft: '   ' }), undefined);

  assert.equal(
    invoiceReviewHardBlocked({
      blockers: ['Pages do not agree on the invoice date. Pick the date from the paper.'],
      invoiceDateNeedsConfirm: true,
      dateConfirmed: false,
    }),
    true
  );
  assert.equal(
    invoiceReviewHardBlocked({
      blockers: ['Pages do not agree on the invoice date. Pick the date from the paper.'],
      invoiceDateNeedsConfirm: true,
      dateConfirmed: true,
    }),
    false
  );
  assert.equal(
    invoiceReviewHardBlocked({
      blockers: [DIFFERENT_INVOICES_BLOCKER],
      invoiceDateNeedsConfirm: false,
      dateConfirmed: true,
    }),
    true
  );

  const run = fs.readFileSync(path.join(process.cwd(), 'lib/domains/receiving/invoicePageScanRun.ts'), 'utf8');
  assert.match(run, /invoiceDateNeedsConfirm: payload\.invoiceDateNeedsConfirm === true/);
});

test('page-scan gst is read and kept through the merged scan', () => {
  assert.deepEqual(readPrintedMoneyFields({ GST: '5.00', subtotal: '', hst: null }), { gst: 5 });
  assert.deepEqual(readPrintedMoneyFields({ gst: 0, pst: 1 }), { gst: 0, pst: 1 });

  const scan = readAll(initialPageScan('66666666-6666-4666-8666-666666666666', 1, NOW), [
    fact({
      lines: [line({ page: 1, name: 'Bananas', quantity: 2, unitCost: 50, totalCost: 100 })],
      subtotal: 100,
      gst: 5,
    }),
  ]);
  assert.equal(scan.scanPages[0]?.gst, 5);

  const merged = mergeReadPages(scan.scanPages);
  assert.equal(merged.printedSubtotal, 100);
  assert.equal(merged.printedGst, 5);

  const ready = finalizeReadyScan(scan);
  assert.equal(ready.printedGst, 5);
  const stored = readStoredPageScan(JSON.parse(JSON.stringify(ready)));
  assert.equal(stored?.printedGst, 5);
  assert.equal(stored?.scanPages[0]?.gst, 5);

  const restored = invoiceResultFromStoredDraft({
    id: 'draft-gst',
    payload: { ...JSON.parse(JSON.stringify(ready)), lines: [] },
  });
  assert.equal(restored?.pageScan?.printedGst, 5);
});
