import { PRODUCT_MATCH_MIN_SCORE } from '@/lib/domains/inventory/productMatching';

/** Top two fuzzy scores within this many points are too close to auto-pick. */
export const FUZZY_CHECK_GAP = 5;

export type InvoiceMatchSource = 'code' | 'learned_name' | 'name';

export interface ReceiveLineFacts {
  quantityUnreadable?: boolean;
  costUnreadable?: boolean;
  nameUnreadable?: boolean;
  /** Top two fuzzy candidates cleared the bar and sit within {@link FUZZY_CHECK_GAP}. */
  fuzzyAmbiguous?: boolean;
  requiresApproval?: boolean;
  lineTotalMismatch?: boolean;
  unitInvalid?: boolean;
  departmentAssumed?: boolean;
  matchSource?: InvoiceMatchSource | null;
  /** Printed code from the saved link. A raw unmatched code is never used here. */
  matchPrintedValue?: string | null;
  productId?: string | null;
  createNew?: boolean;
  name?: string | null;
}

export function fuzzyCandidatesNeedCheck(
  score: number | null | undefined,
  runnerUp: number | null | undefined,
  threshold = PRODUCT_MATCH_MIN_SCORE
): boolean {
  if (typeof score !== 'number' || typeof runnerUp !== 'number') return false;
  if (score < threshold || runnerUp < threshold) return false;
  return score - runnerUp <= FUZZY_CHECK_GAP;
}

/**
 * Check is only a close fuzzy pair, or a quantity or cost the scan could not read.
 * A supplier code or a learned name is never a close-pair Check.
 */
export function lineNeedsCheck(line: ReceiveLineFacts): boolean {
  if (line.quantityUnreadable === true || line.costUnreadable === true) return true;
  if (line.matchSource === 'code' || line.matchSource === 'learned_name') return false;
  return line.fuzzyAmbiguous === true;
}

function nameWasNotRead(line: ReceiveLineFacts): boolean {
  if (line.nameUnreadable === true) return true;
  const name = line.name?.trim() ?? '';
  return !name || name.startsWith('Unread line ');
}

function matched(line: ReceiveLineFacts): boolean {
  return Boolean(line.productId?.trim()) && line.createNew !== true;
}

/** One pill. Earlier rules win, so a line never shows two messages. */
export function receiveLinePill(line: ReceiveLineFacts): string {
  if (line.quantityUnreadable === true) return 'Check: qty not read';
  if (line.costUnreadable === true) return 'Check: price not read';
  if (line.fuzzyAmbiguous === true && line.matchSource !== 'code' && line.matchSource !== 'learned_name') {
    return 'Check: pick one';
  }
  if (nameWasNotRead(line)) return 'Name not read';
  if (line.requiresApproval === true) return 'Price jump';
  if (line.lineTotalMismatch === true) return "Total doesn't add up";
  if (line.unitInvalid === true) return 'Check unit';
  if (line.departmentAssumed === true) return 'Pick department';
  if (line.matchSource === 'code' && matched(line)) {
    const code = line.matchPrintedValue?.trim();
    return code ? `Matched by code · ${code}` : 'Matched by code';
  }
  if (line.matchSource === 'learned_name' && matched(line)) return 'Matched by saved name';
  if (matched(line)) return 'Matched';
  return 'New item';
}

export type ReviewBucket = 'matched' | 'new' | 'check';

/** Every line lands in one bucket so Matched + New + Check equals the line count. */
export function reviewBucket(line: ReceiveLineFacts): ReviewBucket {
  if (lineNeedsCheck(line)) return 'check';
  if (matched(line)) return 'matched';
  return 'new';
}

export function reviewCounts(lines: readonly ReceiveLineFacts[]): {
  matched: number;
  created: number;
  check: number;
} {
  let matchedCount = 0;
  let created = 0;
  let check = 0;
  for (const line of lines) {
    const bucket = reviewBucket(line);
    if (bucket === 'check') check += 1;
    else if (bucket === 'new') created += 1;
    else matchedCount += 1;
  }
  return { matched: matchedCount, created, check };
}

export function reviewChipLabel(counts: { matched: number; created: number; check: number }): string {
  return `Matched ${counts.matched} · New ${counts.created} · Check ${counts.check}`;
}

/** Invoice-level copy stays in the short list. Per-line gaps are the pill. */
export function isInvoiceLevelBlocker(blocker: string): boolean {
  if (!blocker.trim()) return false;
  if (/do not agree on the invoice date/i.test(blocker)) return false;
  if (/^Line \d+\b/.test(blocker)) return false;
  return true;
}

/** After supplier matching, a line with no product is saved as a new catalog item. */
export function withDefaultCreateNew<
  T extends { product_id?: string | null; product_picked?: boolean; create_new?: boolean },
>(lines: readonly T[]): Array<T & { create_new?: boolean }> {
  return lines.map((line) => {
    if (line.create_new === true) return line;
    if (line.product_id?.trim()) return line;
    return { ...line, create_new: true };
  });
}
