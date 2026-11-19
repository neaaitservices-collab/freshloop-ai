import { lineNeedsCheck, type ReceiveLineFacts } from '@/lib/domains/receiving/invoiceLineReview';
import { PLATFORM_DEFAULTS } from '@/lib/domains/stats/platformSettingsDefaults';

export interface ManagerReviewLine extends ReceiveLineFacts {
  requiresApproval?: boolean;
}

/**
 * Managers, including admins, can clear a subtotal flag, a price jump, a line Check, or low confidence.
 * reviewFlags is only the printed-subtotal mismatch. Price jumps live on the line.
 */
export function showManagerOverride(input: {
  manager: boolean;
  reviewFlags: readonly string[];
  lines: readonly ManagerReviewLine[];
  blockers?: readonly string[];
}): boolean {
  if (!input.manager) return false;
  return (
    input.reviewFlags.length > 0 ||
    input.lines.some((line) => line.requiresApproval === true || lineNeedsCheck(line)) ||
    (input.blockers ?? []).some(overrideBlocker)
  );
}

/** Line copy the summary used to drop. Low confidence and a pack change have no pill of their own. */
export function lineBlockerNeedsManager(blocker: string): boolean {
  if (!/^Line \d+\b/.test(blocker)) return false;
  return /cost_guardrail|low_confidence|manager must confirm a pack/i.test(blocker);
}

/** Cleared only by manualReviewOverride from a manager. A pack change is role-gated instead. */
function overrideBlocker(blocker: string): boolean {
  if (!/^Line \d+\b/.test(blocker)) return false;
  return /cost_guardrail|low_confidence/i.test(blocker);
}

/** Price jumps, low confidence, and a subtotal mismatch need a manager. The subtotal block is client-side. */
export function needsManagerSignoff(input: {
  reviewFlags: readonly string[];
  lines: readonly { requiresApproval?: boolean }[];
  blockers: readonly string[];
}): boolean {
  return (
    input.reviewFlags.length > 0 ||
    input.lines.some((line) => line.requiresApproval === true) ||
    input.blockers.some(overrideBlocker)
  );
}

export function clerkCannotConfirm(input: {
  manager: boolean;
  reviewFlags: readonly string[];
  lines: readonly { requiresApproval?: boolean }[];
  blockers: readonly string[];
}): boolean {
  if (input.manager) return false;
  return needsManagerSignoff(input) || input.blockers.some(lineBlockerNeedsManager);
}

export const CLERK_MANAGER_REASON =
  'Manager must confirm flagged costs and low-confidence OCR lines';

export function clerkManagerReviewCopy(input: {
  lines: readonly { requiresApproval?: boolean }[];
  blockers: readonly string[];
}): string {
  const cost =
    input.lines.some((line) => line.requiresApproval === true) ||
    input.blockers.some((blocker) => /cost_guardrail/.test(blocker));
  const low = input.blockers.some((blocker) => /low_confidence/.test(blocker));
  return `This invoice needs store manager review${cost ? ' (cost guardrail)' : ''}${
    low ? ' (low OCR confidence)' : ''
  } before receiving.`;
}

/**
 * Old invoice-modal approval sentence.
 * The page scan does not return the store's live guardrail percent, so this uses the same 20% fallback.
 * With no price-jump lines, the sheet has only a subtotal flag or a Check line.
 */
export function managerApprovalLabel(input: {
  lines: readonly { requiresApproval?: boolean }[];
  thresholdPct?: number;
}): string {
  const count = input.lines.filter((line) => line.requiresApproval === true).length;
  if (count === 0) return 'I reviewed the flagged lines and totals';
  const threshold = input.thresholdPct ?? PLATFORM_DEFAULTS.costGuardrailVariancePct;
  return `Manager approval: ${count} line(s) exceed ±${threshold}% vs moving average cost. I confirm these lines before adding to receiving.`;
}

/** A 409 keeps the server's blocker list. A missing error must not replace that reason. */
export function invoiceRequestErrorMessage(
  status: number,
  body: { error?: unknown; blockers?: unknown }
): string {
  const blockers = Array.isArray(body.blockers)
    ? body.blockers.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  if (status === 409 && blockers.length > 0) return blockers.join(' ');
  if (typeof body.error === 'string' && body.error.trim()) return body.error;
  return 'The invoice could not be read.';
}
