export const OCR_IMAGE_MAX_EDGE = 2000;
export const OCR_IMAGE_JPEG_QUALITY = 0.78;
/** PDF pages use the same long edge as photos and the server JPEG quality. */
export const OCR_PDF_JPEG_QUALITY = 0.72;
export const OCR_PDF_MAX_PAGES = 8;
/** Stay under Vercel's ~4.5MB function body limit. */
export const OCR_UPLOAD_BODY_MAX_BYTES = 4 * 1024 * 1024;
/** One tighter pass when the JSON body is over the cap. */
export const OCR_UPLOAD_TIGHTEN_EDGE = 800;
export const OCR_UPLOAD_TIGHTEN_QUALITY = 0.5;

export const OCR_PAGES_NOT_READY_ERROR =
  'Could not prepare every invoice page. Try a smaller photo or PDF.';
export const OCR_UPLOAD_TOO_LARGE_ERROR =
  'This invoice is too large to send. Try fewer pages or a closer photo.';

export type OcrPageImage = { dataUrl: string; mimeType: string };

export type PreparedOcrFile = {
  dataUrl: string;
  mimeType: string;
  previewUrl: string;
  /** True when another prepare pass would not shrink this upload. */
  fitsUpload: boolean;
  pages: OcrPageImage[];
};

type PdfViewport = { width: number; height: number };

type PdfPageLike = {
  getViewport(params: { scale: number }): PdfViewport;
  render(params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }): { promise: Promise<void> };
};

type PdfDocumentLike = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
  destroy(): Promise<void>;
};

export function pdfTooManyPagesMessage(maxPages = OCR_PDF_MAX_PAGES): string {
  return `This PDF has too many pages. Send ${maxPages} pages or fewer.`;
}

export function ocrPayloadFitsUpload(
  mimeType: string,
  base64Payload: string,
  maxBase64Chars = 1_800_000
): boolean {
  if (mimeType === 'application/pdf' || base64Payload.startsWith('JVBERi0')) return false;
  if (/heic|heif/i.test(mimeType)) return false;
  const acceptable =
    mimeType === 'image/jpeg' || mimeType === 'image/webp' || mimeType === 'image/jpg';
  return acceptable && base64Payload.length <= maxBase64Chars;
}

function dataUrlPayload(dataUrl: string): string {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  return match?.[1] ?? '';
}

export function invoiceOcrUploadBody(pages: OcrPageImage[], demo = false) {
  return {
    imageBase64: demo ? '' : pages[0]?.dataUrl ?? '',
    mimeType: pages[0]?.mimeType || 'image/jpeg',
    pages: demo ? undefined : pages.map((page) => ({ imageBase64: page.dataUrl, mimeType: page.mimeType })),
    demo,
  };
}

export function invoiceOcrUploadBytes(pages: OcrPageImage[], demo = false): number {
  return new TextEncoder().encode(JSON.stringify(invoiceOcrUploadBody(pages, demo))).length;
}

function pagesFitUpload(pages: OcrPageImage[], maxBase64Chars: number): boolean {
  return (
    pages.length > 0 &&
    pages.every((page) => ocrPayloadFitsUpload(page.mimeType, dataUrlPayload(page.dataUrl), maxBase64Chars))
  );
}

function encodeCanvasForOcr(
  canvas: HTMLCanvasElement,
  quality: number
): { dataUrl: string; mimeType: string } {
  const webp = canvas.toDataURL('image/webp', quality);
  if (webp.startsWith('data:image/webp')) {
    return { dataUrl: webp, mimeType: 'image/webp' };
  }
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), mimeType: 'image/jpeg' };
}

function drawToCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxEdge: number,
  quality: number
): { dataUrl: string; mimeType: string } | null {
  if (typeof document === 'undefined') return null;
  const longest = Math.max(width, height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
  return encodeCanvasForOcr(canvas, quality);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read the image file.'));
    };
    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.readAsDataURL(file);
  });
}

async function fileIsPdf(file: File): Promise<boolean> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return true;
  if (file.size < 4) return false;
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return String.fromCharCode(header[0], header[1], header[2], header[3]) === '%PDF';
}

async function openPdfDocument(bytes: Uint8Array): Promise<PdfDocumentLike> {
  const pdfjs = await import('pdfjs-dist');
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  }
  return pdfjs.getDocument({
    data: bytes,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
}

/** One JPEG per page, longest edge 2000px, quality about 0.72. */
export async function rasterizePdfBytes(
  bytes: Uint8Array,
  options?: { maxEdge?: number; quality?: number; maxPages?: number }
): Promise<OcrPageImage[]> {
  const maxEdge = options?.maxEdge ?? OCR_IMAGE_MAX_EDGE;
  const quality = options?.quality ?? OCR_PDF_JPEG_QUALITY;
  const maxPages = options?.maxPages ?? OCR_PDF_MAX_PAGES;
  let doc: PdfDocumentLike | undefined;
  try {
    doc = await openPdfDocument(bytes);
    if (doc.numPages > maxPages) throw new Error(pdfTooManyPagesMessage(maxPages));
    if (doc.numPages < 1) throw new Error('Could not prepare the photo. This PDF has no pages.');
    if (typeof document === 'undefined') {
      throw new Error('Could not prepare the photo. Open this PDF in the browser and try again.');
    }
    const pages: OcrPageImage[] = [];
    for (let number = 1; number <= doc.numPages; number += 1) {
      const page = await doc.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const longest = Math.max(base.width, base.height);
      const viewport = page.getViewport({ scale: longest > 0 ? maxEdge / longest : 1 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not prepare the photo. Try another PDF.');
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (!dataUrl.startsWith('data:image/jpeg')) {
        throw new Error('Could not prepare the photo. This browser could not encode the PDF page.');
      }
      pages.push({ dataUrl, mimeType: 'image/jpeg' });
    }
    return pages;
  } catch (error) {
    if (error instanceof Error && /too many pages|Could not prepare the photo|This PDF/.test(error.message)) {
      throw error;
    }
    throw new Error('Could not prepare the photo. This PDF could not be converted to page images.');
  } finally {
    await doc?.destroy().catch(() => undefined);
  }
}

function preparedFromPages(
  pages: OcrPageImage[],
  maxBase64Chars: number,
  previewUrl?: string
): PreparedOcrFile {
  const first = pages[0];
  return {
    dataUrl: first?.dataUrl ?? '',
    mimeType: first?.mimeType ?? 'image/jpeg',
    previewUrl: previewUrl ?? first?.dataUrl ?? '',
    fitsUpload: pagesFitUpload(pages, maxBase64Chars),
    pages,
  };
}

/** Compress invoice / supplier-sheet photos before OCR API calls. */
export async function prepareImageFileForOcr(
  file: File,
  options?: { maxEdge?: number; quality?: number; maxBase64Chars?: number }
): Promise<PreparedOcrFile> {
  const maxBase64Chars = options?.maxBase64Chars ?? 1_800_000;
  if (await fileIsPdf(file)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pages = await rasterizePdfBytes(bytes, options);
    return preparedFromPages(pages, maxBase64Chars);
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      try {
        const encoded = drawToCanvas(
          bitmap,
          bitmap.width,
          bitmap.height,
          options?.maxEdge ?? OCR_IMAGE_MAX_EDGE,
          options?.quality ?? OCR_IMAGE_JPEG_QUALITY
        );
        if (encoded) return preparedFromPages([encoded], maxBase64Chars);
      } finally {
        bitmap.close?.();
      }
    } catch {
      // Fall through to the data-URL path when the browser cannot decode the file.
    }
  }

  const raw = await readFileAsDataUrl(file);
  const prepared = await prepareImageDataUrlForOcr(raw, options);
  return { ...prepared, previewUrl: prepared.dataUrl };
}

/** Run the prepare pass on every page. A short result is a refusal, not a shorter invoice. */
export async function reprepareEveryOcrPage(
  ready: PreparedOcrFile,
  options?: { maxEdge?: number; quality?: number; maxBase64Chars?: number }
): Promise<PreparedOcrFile> {
  if (ready.pages.length === 0) throw new Error(OCR_PAGES_NOT_READY_ERROR);
  const maxBase64Chars = options?.maxBase64Chars ?? 1_800_000;
  const pages: OcrPageImage[] = [];
  for (const page of ready.pages) {
    const prepared = await prepareImageDataUrlForOcr(page.dataUrl, options);
    if (prepared.pages.length === 0) throw new Error(OCR_PAGES_NOT_READY_ERROR);
    pages.push(...prepared.pages);
  }
  if (pages.length < ready.pages.length) throw new Error(OCR_PAGES_NOT_READY_ERROR);
  const next = preparedFromPages(pages, maxBase64Chars, ready.previewUrl);
  if (!next.fitsUpload) throw new Error(OCR_PAGES_NOT_READY_ERROR);
  return next;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(OCR_UPLOAD_TOO_LARGE_ERROR));
    img.src = dataUrl;
  });
}

async function tightenOcrPage(page: OcrPageImage): Promise<OcrPageImage> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error(OCR_UPLOAD_TOO_LARGE_ERROR);
  }
  const img = await loadImage(page.dataUrl);
  const longest = Math.max(img.width, img.height);
  const scale = longest > OCR_UPLOAD_TIGHTEN_EDGE ? OCR_UPLOAD_TIGHTEN_EDGE / longest : 1;
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(OCR_UPLOAD_TOO_LARGE_ERROR);
  ctx.drawImage(img, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', OCR_UPLOAD_TIGHTEN_QUALITY);
  if (!dataUrl.startsWith('data:image/jpeg')) throw new Error(OCR_UPLOAD_TOO_LARGE_ERROR);
  return { dataUrl, mimeType: 'image/jpeg' };
}

/** If the POST body is over ~4MB, recompress every page once. Refuse when it is still too big. */
export async function limitInvoiceOcrUpload(pages: OcrPageImage[]): Promise<OcrPageImage[]> {
  if (pages.length === 0) throw new Error(OCR_UPLOAD_TOO_LARGE_ERROR);
  if (invoiceOcrUploadBytes(pages) <= OCR_UPLOAD_BODY_MAX_BYTES) return pages;
  const tightened: OcrPageImage[] = [];
  for (const page of pages) tightened.push(await tightenOcrPage(page));
  if (tightened.length < pages.length || invoiceOcrUploadBytes(tightened) > OCR_UPLOAD_BODY_MAX_BYTES) {
    throw new Error(OCR_UPLOAD_TOO_LARGE_ERROR);
  }
  return tightened;
}

/** Downscale and re-encode invoice photos so OCR requests stay under serverless body limits. */
export async function prepareImageDataUrlForOcr(
  dataUrl: string,
  options?: { maxEdge?: number; quality?: number; maxBase64Chars?: number }
): Promise<PreparedOcrFile> {
  const maxEdge = options?.maxEdge ?? OCR_IMAGE_MAX_EDGE;
  const quality = options?.quality ?? OCR_IMAGE_JPEG_QUALITY;
  const maxBase64Chars = options?.maxBase64Chars ?? 1_800_000;

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return preparedFromPages([{ dataUrl, mimeType: 'image/jpeg' }], maxBase64Chars);
  }

  const mimeType = match[1];
  const base64Payload = match[2];
  if (mimeType === 'application/pdf' || base64Payload.startsWith('JVBERi0')) {
    const binary = Uint8Array.from(atob(base64Payload), (char) => char.charCodeAt(0));
    const pages = await rasterizePdfBytes(binary, { ...options, quality: options?.quality ?? OCR_PDF_JPEG_QUALITY });
    return preparedFromPages(pages, maxBase64Chars);
  }
  const needsTranscode = /heic|heif/i.test(mimeType);
  if (!needsTranscode && ocrPayloadFitsUpload(mimeType, base64Payload, maxBase64Chars)) {
    return preparedFromPages([{ dataUrl, mimeType }], maxBase64Chars);
  }

  if (typeof document === 'undefined') {
    return {
      dataUrl,
      mimeType: mimeType || 'image/jpeg',
      previewUrl: dataUrl,
      fitsUpload: false,
      pages: [{ dataUrl, mimeType: mimeType || 'image/jpeg' }],
    };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const encoded = drawToCanvas(img, img.width, img.height, maxEdge, quality);
      if (!encoded) {
        resolve({
          dataUrl,
          mimeType: mimeType || 'image/jpeg',
          previewUrl: dataUrl,
          fitsUpload: false,
          pages: [{ dataUrl, mimeType: mimeType || 'image/jpeg' }],
        });
        return;
      }
      resolve(preparedFromPages([encoded], maxBase64Chars));
    };
    img.onerror = () => reject(new Error('Could not prepare the photo for upload. Try another image.'));
    img.src = dataUrl;
  });
}
