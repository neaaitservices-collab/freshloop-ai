/** Default flash models for text/vision (newest first — Google retires older flash IDs). */
export const GEMINI_FLASH_MODEL_FALLBACKS = [
  'gemini-3.8-flash',
  'gemini-1.5-flash',
] as const;

/** Invoice scans use one flash model. GEMINI_OCR_MODEL overrides the default. */
export const INVOICE_OCR_FLASH_MODEL = 'gemini-3.8-flash';

export function invoiceOcrModelCandidates(): string[] {
  const fromEnv = process.env.GEMINI_OCR_MODEL?.trim();
  if (fromEnv) return [fromEnv];
  return [INVOICE_OCR_FLASH_MODEL];
}
