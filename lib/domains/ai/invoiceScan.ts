import sharp from 'sharp';

/** Longest edge sent to Gemini for invoice photos. */
export const INVOICE_PHOTO_MAX_EDGE = 1200;
export const INVOICE_PHOTO_JPEG_QUALITY = 72;
/** Decoded upload cap, checked before sharp runs. */
export const INVOICE_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
/** Reject decompression bombs. A 48MP phone photo still fits. */
export const INVOICE_PHOTO_MAX_PIXELS = 50_000_000;

export type InvoicePhotoKind = 'jpeg' | 'png' | 'webp' | 'pdf' | 'unknown';

export function invoicePhotoKind(input: Buffer): InvoicePhotoKind {
  if (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) return 'jpeg';
  if (
    input.length >= 8 &&
    input[0] === 0x89 &&
    input[1] === 0x50 &&
    input[2] === 0x4e &&
    input[3] === 0x47 &&
    input[4] === 0x0d &&
    input[5] === 0x0a &&
    input[6] === 0x1a &&
    input[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    input.length >= 12 &&
    input.toString('ascii', 0, 4) === 'RIFF' &&
    input.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  if (input.length >= 4 && input.toString('ascii', 0, 4) === '%PDF') return 'pdf';
  return 'unknown';
}

export function invoicePhotoWithinPixelCap(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
  return width * height <= INVOICE_PHOTO_MAX_PIXELS;
}

function assertInvoicePhotoBytes(input: Buffer): void {
  if (input.length > INVOICE_PHOTO_MAX_BYTES) {
    throw new Error('Could not prepare the photo. The upload is too large.');
  }
  const kind = invoicePhotoKind(input);
  if (kind === 'pdf') throw new Error('PDF not supported yet');
  if (kind !== 'jpeg' && kind !== 'png' && kind !== 'webp') {
    throw new Error('Could not prepare the photo. The upload is not a JPEG, PNG, or WebP image.');
  }
}

/** Per Gemini HTTP/SDK attempt. Kept inside the 20–25s window Nelson approved. */
export const INVOICE_OCR_ATTEMPT_TIMEOUT_MS = 22_000;

/**
 * Wall clock for the whole invoice model ladder. A timed-out attempt leaves
 * too little time to start another model.
 */
export const INVOICE_OCR_TOTAL_BUDGET_MS = 25_000;

export function boundedAttemptMs(
  now: number,
  options?: { attemptTimeoutMs?: number; deadlineAtMs?: number }
): number | null | 'unlimited' {
  if (options?.attemptTimeoutMs == null && options?.deadlineAtMs == null) {
    return 'unlimited';
  }
  const cap = options.attemptTimeoutMs ?? Number.POSITIVE_INFINITY;
  const remaining = options.deadlineAtMs == null ? cap : options.deadlineAtMs - now;
  if (remaining <= 0) return null;
  return Math.min(cap, remaining);
}

export function createAttemptAbort(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

export function geminiFailureDetail(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return 'timed out';
    return error.message || 'request failed';
  }
  return 'request failed';
}

/** Always resize and re-encode before the photo is sent to Gemini. */
export async function downscaleInvoicePhoto(
  base64: string,
  _mimeType: string
): Promise<{ data: string; mimeType: 'image/jpeg' }> {
  const payload = base64.includes(',') ? (base64.split(',')[1] ?? '') : base64;
  const input = Buffer.from(payload, 'base64');
  if (input.length === 0) {
    throw new Error('Could not prepare the photo. The upload was empty.');
  }
  assertInvoicePhotoBytes(input);

  try {
    const image = sharp(input, {
      failOn: 'none',
      limitInputPixels: INVOICE_PHOTO_MAX_PIXELS,
      animated: false,
    });
    const meta = await image.metadata();
    if (!invoicePhotoWithinPixelCap(meta.width ?? 0, meta.height ?? 0)) {
      throw new Error('Could not prepare the photo. The image is too large.');
    }
    const output = await image
      .rotate()
      .resize({
        width: INVOICE_PHOTO_MAX_EDGE,
        height: INVOICE_PHOTO_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: INVOICE_PHOTO_JPEG_QUALITY })
      .toBuffer();
    if (output.length === 0) {
      throw new Error('encoder returned an empty image');
    }
    return { data: output.toString('base64'), mimeType: 'image/jpeg' };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Could not prepare the photo')) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith('PDF not supported yet')) {
      throw error;
    }
    if (error instanceof Error && /pixel limit/i.test(error.message)) {
      throw new Error('Could not prepare the photo. The image is too large.');
    }
    throw new Error('Could not prepare the photo before sending it to the reader.');
  }
}
