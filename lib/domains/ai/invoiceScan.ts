import sharp from 'sharp';

/** Longest edge sent to Gemini for invoice photos. */
export const INVOICE_PHOTO_MAX_EDGE = 1200;
export const INVOICE_PHOTO_JPEG_QUALITY = 72;

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

  try {
    const output = await sharp(input, { failOn: 'none' })
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
    throw new Error('Could not prepare the photo before sending it to the reader.');
  }
}
