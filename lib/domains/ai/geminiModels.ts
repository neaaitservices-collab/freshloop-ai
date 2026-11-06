/** Default flash models for text/vision (newest first — Google retires older flash IDs). */
export const GEMINI_FLASH_MODEL_FALLBACKS = [
  'gemini-3.8-flash',
  'gemini-1.5-flash',
] as const;

export function invoiceOcrModelCandidates(): string[] {
  const fromEnv = process.env.GEMINI_OCR_MODEL?.trim();
  if (fromEnv) return [fromEnv, ...GEMINI_FLASH_MODEL_FALLBACKS.filter((m) => m !== fromEnv)];
  return [...GEMINI_FLASH_MODEL_FALLBACKS];
}
