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

export type InvoiceOcrThinkingConfig =
  | { thinkingLevel: 'LOW' | 'MINIMAL'; includeThoughts: false }
  | { thinkingBudget: 0; includeThoughts: false };

/**
 * Lowest thinking the invoice model will accept.
 * gemini-3.8-flash and gemini-3.7-flash return 400 for thinkingBudget 0 and for MINIMAL.
 * LOW is the smallest level those models accept. Older flash models can disable thinking.
 */
export function invoiceOcrThinkingConfig(modelName: string): InvoiceOcrThinkingConfig {
  if (/gemini-(3\.[87]-flash|4)/.test(modelName)) {
    return { thinkingLevel: 'LOW', includeThoughts: false };
  }
  if (/gemini-3/.test(modelName)) {
    return { thinkingLevel: 'MINIMAL', includeThoughts: false };
  }
  return { thinkingBudget: 0, includeThoughts: false };
}
