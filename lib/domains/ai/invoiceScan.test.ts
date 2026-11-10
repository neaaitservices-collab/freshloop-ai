import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import {
  boundedAttemptMs,
  createAttemptAbort,
  downscaleInvoicePhoto,
  geminiFailureDetail,
  INVOICE_OCR_ATTEMPT_TIMEOUT_MS,
  INVOICE_OCR_TOTAL_BUDGET_MS,
  INVOICE_PHOTO_MAX_EDGE,
} from '@/lib/domains/ai/invoiceScan';
import { invoiceOcrModelCandidates, INVOICE_OCR_FLASH_MODEL } from '@/lib/domains/ai/geminiModels';

test('invoice scan attempt limit respects the 22s cap and the total budget', () => {
  assert.equal(INVOICE_OCR_ATTEMPT_TIMEOUT_MS, 22_000);
  assert.equal(INVOICE_OCR_TOTAL_BUDGET_MS, 25_000);
  assert.equal(boundedAttemptMs(0, undefined), 'unlimited');
  assert.equal(
    boundedAttemptMs(1_000, { attemptTimeoutMs: 22_000, deadlineAtMs: 25_000 }),
    22_000
  );
  assert.equal(
    boundedAttemptMs(20_000, { attemptTimeoutMs: 22_000, deadlineAtMs: 25_000 }),
    5_000
  );
  assert.equal(
    boundedAttemptMs(25_000, { attemptTimeoutMs: 22_000, deadlineAtMs: 25_000 }),
    null
  );
});

test('attempt abort fires and abort errors stay worded as timeouts', async () => {
  const attempt = createAttemptAbort(30);
  await new Promise<void>((resolve) => {
    attempt.signal.addEventListener('abort', () => resolve());
  });
  assert.equal(attempt.signal.aborted, true);
  assert.equal(geminiFailureDetail(new DOMException('The operation was aborted', 'AbortError')), 'timed out');
});

test('invoice OCR uses one flash model', () => {
  const previous = process.env.GEMINI_OCR_MODEL;
  delete process.env.GEMINI_OCR_MODEL;
  try {
    assert.deepEqual(invoiceOcrModelCandidates(), [INVOICE_OCR_FLASH_MODEL]);
    process.env.GEMINI_OCR_MODEL = 'gemini-3.8-flash';
    assert.deepEqual(invoiceOcrModelCandidates(), ['gemini-3.8-flash']);
  } finally {
    if (previous == null) delete process.env.GEMINI_OCR_MODEL;
    else process.env.GEMINI_OCR_MODEL = previous;
  }
});

test('invoice photos are downscaled before they can be sent', async () => {
  const big = await sharp({
    create: {
      width: 2400,
      height: 1800,
      channels: 3,
      background: { r: 20, g: 120, b: 40 },
    },
  })
    .jpeg()
    .toBuffer();
  const prepared = await downscaleInvoicePhoto(big.toString('base64'), 'image/jpeg');
  assert.equal(prepared.mimeType, 'image/jpeg');
  const meta = await sharp(Buffer.from(prepared.data, 'base64')).metadata();
  assert.ok((meta.width ?? 0) <= INVOICE_PHOTO_MAX_EDGE);
  assert.ok((meta.height ?? 0) <= INVOICE_PHOTO_MAX_EDGE);
  assert.ok((meta.width ?? 0) > 0);
});

test('unreadable invoice bytes fail before a model call', async () => {
  await assert.rejects(
    () => downscaleInvoicePhoto(Buffer.from('not-an-image').toString('base64'), 'image/jpeg'),
    /Could not prepare the photo/
  );
});

test('invoice route sends one prepared flash attempt inside the time budget', () => {
  const route = fs.readFileSync(path.join(process.cwd(), 'app/api/invoice-ocr/route.ts'), 'utf8');
  const gemini = fs.readFileSync(path.join(process.cwd(), 'lib/domains/ai/gemini.ts'), 'utf8');
  assert.match(route, /downscaleInvoicePhoto/);
  assert.match(route, /maxModelsToTry: 1/);
  assert.match(route, /attemptTimeoutMs: INVOICE_OCR_ATTEMPT_TIMEOUT_MS/);
  assert.match(route, /deadlineAtMs: scanStartedAt \+ INVOICE_OCR_TOTAL_BUDGET_MS/);
  assert.equal(route.includes('maxModelsToTry: 5'), false);
  assert.equal(route.includes('skipModelDiscovery: false'), false);
  assert.match(gemini, /createAttemptAbort/);
  assert.match(gemini, /signal/);
  assert.match(gemini, /time budget spent/);
});
