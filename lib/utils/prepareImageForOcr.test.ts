import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OCR_IMAGE_MAX_EDGE,
  OCR_PDF_JPEG_QUALITY,
  OCR_PDF_MAX_PAGES,
  OCR_UPLOAD_BODY_MAX_BYTES,
  OCR_UPLOAD_TIGHTEN_QUALITY,
  invoiceOcrUploadBytes,
  limitInvoiceOcrUpload,
  ocrPayloadFitsUpload,
  pdfTooManyPagesMessage,
  prepareImageDataUrlForOcr,
  prepareImageFileForOcr,
  reprepareEveryOcrPage,
  type PreparedOcrFile,
} from '@/lib/utils/prepareImageForOcr';

function buildPdf(pageCount: number): Buffer {
  const chunks = ['%PDF-1.4\n'];
  const offsets = [0];
  const add = (body: string) => {
    offsets.push(Buffer.byteLength(chunks.join('')));
    chunks.push(body);
  };
  add('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n');
  const kids = Array.from({ length: pageCount }, (_, index) => `${index + 3} 0 R`).join(' ');
  add(`2 0 obj << /Type /Pages /Count ${pageCount} /Kids [${kids}] >> endobj\n`);
  for (let index = 0; index < pageCount; index += 1) {
    add(`${index + 3} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj\n`);
  }
  const xrefStart = Buffer.byteLength(chunks.join(''));
  const size = pageCount + 3;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let index = 1; index < size; index += 1) {
    xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer << /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(xref);
  return Buffer.from(chunks.join(''));
}

test('a small jpeg already fits and a pdf payload does not', () => {
  assert.equal(ocrPayloadFitsUpload('image/jpeg', 'abc'), true);
  assert.equal(ocrPayloadFitsUpload('application/pdf', 'JVBERi0'), false);
  assert.equal(ocrPayloadFitsUpload('image/jpeg', 'x'.repeat(1_800_001)), false);
  assert.match(pdfTooManyPagesMessage(), /8 pages or fewer/);
  assert.equal(OCR_PDF_MAX_PAGES, 8);
  assert.equal(OCR_PDF_JPEG_QUALITY, 0.72);
});

test('createImageBitmap downscales a photo and marks the upload ready', async () => {
  const previousBitmap = globalThis.createImageBitmap;
  const previousDocument = globalThis.document;
  const sizes: Array<{ width: number; height: number }> = [];
  let closed = 0;
  let bitmapOptions: ImageBitmapOptions | undefined;
  globalThis.createImageBitmap = (async (_source: ImageBitmapSource, options?: ImageBitmapOptions) => {
    bitmapOptions = options;
    return {
      width: 2400,
      height: 1600,
      close() {
        closed += 1;
      },
    } as ImageBitmap;
  }) as typeof createImageBitmap;
  globalThis.document = {
    createElement() {
      const canvas = {
        width: 0,
        height: 0,
        getContext() {
          return { drawImage() {} };
        },
        toDataURL(mime: string) {
          sizes.push({ width: canvas.width, height: canvas.height });
          const payload = Buffer.from(`${canvas.width}x${canvas.height}`).toString('base64');
          return `data:${mime};base64,${payload}`;
        },
      };
      return canvas;
    },
  } as unknown as Document;
  try {
    const file = new File([Uint8Array.from([1, 2, 3, 4])], 'invoice.jpg', { type: 'image/jpeg' });
    const prepared = await prepareImageFileForOcr(file);
    assert.equal(prepared.fitsUpload, true);
    assert.equal(prepared.mimeType, 'image/webp');
    assert.equal(prepared.pages.length, 1);
    assert.equal(closed, 1);
    assert.deepEqual(bitmapOptions, { imageOrientation: 'from-image' });
    assert.deepEqual(sizes[0], { width: OCR_IMAGE_MAX_EDGE, height: 800 });
  } finally {
    globalThis.createImageBitmap = previousBitmap;
    globalThis.document = previousDocument;
  }
});

test('an already small jpeg skips a second prepare', async () => {
  const payload = Buffer.from('tiny-photo').toString('base64');
  const prepared = await prepareImageDataUrlForOcr(`data:image/jpeg;base64,${payload}`);
  assert.equal(prepared.fitsUpload, true);
  assert.equal(prepared.pages.length, 1);
  assert.equal(prepared.mimeType, 'image/jpeg');
});

test('reprepare keeps every page or refuses the scan', async () => {
  const small = `data:image/jpeg;base64,${Buffer.from('page').toString('base64')}`;
  const ready: PreparedOcrFile = {
    dataUrl: small,
    mimeType: 'image/jpeg',
    previewUrl: small,
    fitsUpload: false,
    pages: [0, 1, 2].map((index) => ({
      dataUrl: `${small}${index}`,
      mimeType: 'image/jpeg',
    })),
  };
  const prepared = await reprepareEveryOcrPage(ready);
  assert.equal(prepared.pages.length, 3);
  assert.equal(prepared.pages[2]?.dataUrl, ready.pages[2]?.dataUrl);

  const huge = `data:image/jpeg;base64,${'A'.repeat(1_800_001)}`;
  await assert.rejects(
    () =>
      reprepareEveryOcrPage({
        ...ready,
        pages: [ready.pages[0], { dataUrl: huge, mimeType: 'image/jpeg' }],
      }),
    /every invoice page/
  );
});

test('a dense 8-page upload is tightened once or refused', async () => {
  const page = { dataUrl: `data:image/jpeg;base64,${'A'.repeat(600_000)}`, mimeType: 'image/jpeg' };
  const pages = Array.from({ length: 8 }, () => page);
  assert.ok(invoiceOcrUploadBytes(pages) > OCR_UPLOAD_BODY_MAX_BYTES);
  await assert.rejects(() => limitInvoiceOcrUpload(pages), /too large to send/);

  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;
  const qualities: number[] = [];
  class FakeImage {
    width = 1600;
    height = 2200;
    onload: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  globalThis.Image = FakeImage as unknown as typeof Image;
  const canvasFor = (payload: string) =>
    ({
      createElement() {
        const canvas = {
          width: 0,
          height: 0,
          getContext() {
            return { drawImage() {} };
          },
          toDataURL(_mime: string, quality: number) {
            qualities.push(quality);
            return `data:image/jpeg;base64,${payload}`;
          },
        };
        return canvas;
      },
    }) as unknown as Document;

  try {
    qualities.length = 0;
    globalThis.document = canvasFor(Buffer.from('small').toString('base64'));
    const fitted = await limitInvoiceOcrUpload(pages);
    assert.equal(fitted.length, 8);
    assert.ok(invoiceOcrUploadBytes(fitted) <= OCR_UPLOAD_BODY_MAX_BYTES);
    assert.equal(qualities.length, 8);
    assert.ok(qualities.every((quality) => quality === OCR_UPLOAD_TIGHTEN_QUALITY));

    qualities.length = 0;
    globalThis.document = canvasFor('B'.repeat(600_000));
    await assert.rejects(() => limitInvoiceOcrUpload(pages), /too large to send/);
    assert.equal(qualities.length, 8);
  } finally {
    globalThis.document = previousDocument;
    globalThis.Image = previousImage;
  }
});

test('pdf pages are capped at 8 before a model upload', async () => {
  const nine = new File([new Uint8Array(buildPdf(9))], 'invoice.pdf', { type: 'application/pdf' });
  await assert.rejects(() => prepareImageFileForOcr(nine), /too many pages/);
  const one = new File([new Uint8Array(buildPdf(1))], 'invoice.pdf', { type: 'application/pdf' });
  await assert.rejects(
    () => prepareImageFileForOcr(one),
    /Open this PDF in the browser/
  );
});
