import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OCR_IMAGE_MAX_EDGE,
  OCR_PDF_JPEG_QUALITY,
  OCR_PDF_MAX_PAGES,
  ocrPayloadFitsUpload,
  pdfTooManyPagesMessage,
  prepareImageDataUrlForOcr,
  prepareImageFileForOcr,
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
  globalThis.createImageBitmap = async () =>
    ({
      width: 2400,
      height: 1600,
      close() {
        closed += 1;
      },
    }) as unknown as ImageBitmap;
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

test('pdf pages are capped at 8 before a model upload', async () => {
  const nine = new File([new Uint8Array(buildPdf(9))], 'invoice.pdf', { type: 'application/pdf' });
  await assert.rejects(() => prepareImageFileForOcr(nine), /too many pages/);
  const one = new File([new Uint8Array(buildPdf(1))], 'invoice.pdf', { type: 'application/pdf' });
  await assert.rejects(
    () => prepareImageFileForOcr(one),
    /Open this PDF in the browser/
  );
});
