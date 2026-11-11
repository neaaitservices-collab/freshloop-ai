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
  INVOICE_PDF_MAX_PAGES,
  INVOICE_PHOTO_MAX_BYTES,
  INVOICE_PHOTO_MAX_EDGE,
  invoicePhotoWithinPixelCap,
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

test('a PDF is sent through and a non-image is rejected', async () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n/Type /Page\nendobj\n%%EOF');
  const preparedPdf = await downscaleInvoicePhoto(pdf.toString('base64'), 'application/pdf');
  assert.equal(preparedPdf.mimeType, 'application/pdf');
  assert.equal(preparedPdf.data, pdf.toString('base64'));
  const manyPages = Buffer.from(
    `%PDF-1.4\n${Array.from({ length: INVOICE_PDF_MAX_PAGES + 1 }, () => '/Type /Page').join('\n')}\n%%EOF`
  );
  await assert.rejects(
    () => downscaleInvoicePhoto(manyPages.toString('base64'), 'application/pdf'),
    /too many pages/
  );
  const hugePdf = Buffer.alloc(INVOICE_PHOTO_MAX_BYTES + 1);
  hugePdf.write('%PDF');
  await assert.rejects(
    () => downscaleInvoicePhoto(hugePdf.toString('base64'), 'application/pdf'),
    /This PDF is too large/
  );
  await assert.rejects(
    () => downscaleInvoicePhoto(Buffer.from('GIF89a not an invoice').toString('base64'), 'image/gif'),
    /not a JPEG, PNG, or WebP/
  );
  const png = await sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .png()
    .toBuffer();
  const prepared = await downscaleInvoicePhoto(png.toString('base64'), 'image/png');
  assert.equal(prepared.mimeType, 'image/jpeg');
  const tooBig = Buffer.alloc(INVOICE_PHOTO_MAX_BYTES + 1);
  assert.equal(invoicePhotoWithinPixelCap(100_000, 100_000), false);
  assert.equal(invoicePhotoWithinPixelCap(4000, 3000), true);
  tooBig[0] = 0xff;
  tooBig[1] = 0xd8;
  tooBig[2] = 0xff;
  await assert.rejects(
    () => downscaleInvoicePhoto(tooBig.toString('base64'), 'image/jpeg'),
    /too large/
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
