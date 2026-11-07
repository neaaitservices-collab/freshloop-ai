import { scoreProductMatch } from '@/lib/domains/inventory/productMatching';

/** Minimum blended confidence before OCR lines may auto-commit without manager override. */
export const INVOICE_OCR_CONFIDENCE_THRESHOLD = 0.85;

export function matchConfidenceFromCatalogScore(score: number): number {
  const normalized = Number.isFinite(score) ? score : 0;
  return Math.min(1, Math.max(0, normalized / 100));
}

export function normalizeExtractionConfidence(raw: unknown, source: 'sample' | 'photo'): number {
  const n = Number(raw);
  if (Number.isFinite(n)) {
    if (n > 1 && n <= 100) return Math.min(1, Math.max(0, n / 100));
    if (n >= 0 && n <= 1) return n;
  }
  return source === 'sample' ? 0.95 : 0.78;
}

export function combineLineConfidence(extraction: number, match: number | null): number {
  const ext = Math.min(1, Math.max(0, extraction));
  if (match === null) {
    return Number((ext * 0.72).toFixed(4));
  }
  const m = Math.min(1, Math.max(0, match));
  return Number((ext * 0.45 + m * 0.55).toFixed(4));
}

export function lineNeedsManualReview(lineConfidence: number): boolean {
  return lineConfidence < INVOICE_OCR_CONFIDENCE_THRESHOLD;
}

export function computeCommitLineConfidence(
  line: {
    line_name?: string;
    product_id: string;
    extraction_confidence?: number;
    match_confidence?: number;
    line_confidence?: number;
  },
  productName: string | null | undefined
): number {
  if (typeof line.line_confidence === 'number') {
    return Math.min(1, Math.max(0, line.line_confidence));
  }
  const extraction =
    typeof line.extraction_confidence === 'number'
      ? line.extraction_confidence
      : line.line_name?.trim()
        ? 0.85
        : 0.9;
  if (typeof line.match_confidence === 'number') {
    return combineLineConfidence(extraction, line.match_confidence);
  }
  if (!productName) return combineLineConfidence(extraction, null);
  const invoiceLabel = line.line_name?.trim() || productName;
  const matchScore = scoreProductMatch(invoiceLabel, productName);
  return combineLineConfidence(extraction, matchConfidenceFromCatalogScore(matchScore));
}
