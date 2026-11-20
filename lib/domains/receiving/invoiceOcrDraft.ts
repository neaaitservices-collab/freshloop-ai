import type { Department } from '@prisma/client';
import { lineNeedsManualReview } from '@/lib/domains/receiving/invoiceOcrConfidence';
import { reviewBlockersAfterApproval } from '@/lib/domains/receiving/receiveReviewGate';
import { selectInvoiceHeaderTotal } from '@/lib/domains/receiving/invoiceHeaderTotal';
import {
  MAX_RECEIVING_BATCH_SIZE,
  ZERO_DOLLAR_REVIEW_REASON,
} from '@/lib/domains/receiving/receivingLogPost';
import {
  quantityKindForInvoiceUnit,
  type OcrDraftLine,
  type OcrDraftPayload,
  type OcrQuantityKind,
  type OcrReviewReasonCode,
} from '@/lib/domains/receiving/invoiceOcrCommit';
import {
  normalizeLineNameKey,
  normalizeSupplierCode,
  printedMatchValue,
} from '@/lib/domains/receiving/supplierProductMatch';

export const OCR_REVIEW_REASONS = [
  'low_confidence',
  'cost_guardrail',
  'department_assumed',
  'quantity_unreadable',
  'name_unreadable',
  'line_total_mismatch',
  'cost_unreadable',
  'unit_invalid',
] as const;

export type OcrReviewReason = (typeof OCR_REVIEW_REASONS)[number];

type ReviewReasonDrift = Exclude<OcrReviewReason, OcrReviewReasonCode> | Exclude<OcrReviewReasonCode, OcrReviewReason>;
const _reviewReasonsMatch: [ReviewReasonDrift] extends [never] ? true : never = true;
void _reviewReasonsMatch;

const HARD_REVIEW_REASONS = new Set<OcrReviewReason>([
  'quantity_unreadable',
  'name_unreadable',
  'cost_unreadable',
]);

const MANAGER_REVIEW_REASONS = new Set<OcrReviewReason>([
  'low_confidence',
  'cost_guardrail',
  'department_assumed',
  'line_total_mismatch',
  'unit_invalid',
]);

export interface AuditedDraftSourceLine {
  item_name: string;
  product_id: string | null;
  quantity: number;
  unit: string;
  unit_cost: number;
  department: Department | 'PRODUCE' | 'DAIRY' | 'BAKERY' | 'PANTRY' | 'DELI_KITCHEN' | 'GROCERY';
  case_pack_size: number;
  line_confidence: number;
  requires_approval: boolean;
  department_assumed?: boolean;
  quantity_unreadable?: boolean;
  cost_unreadable?: boolean;
  unit_invalid?: boolean;
  line_total_mismatch?: boolean;
  line_total_note?: string;
  supplier_code?: string | null;
  printed_name?: string | null;
  match_source?: 'code' | 'learned_name' | 'name' | null;
  match_printed_value?: string | null;
  matched_product_name?: string | null;
  /** Two fuzzy candidates were too close to auto-pick. Not a posting blocker. */
  fuzzy_ambiguous?: boolean;
}

export interface OcrDraftResolution {
  vendorName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  lines?: Array<{
    index: number;
    line_name?: string;
    quantity?: number;
    department?: Department;
    product_id?: string;
    remember?: boolean;
    unlink?: boolean;
    create_new?: boolean;
  }>;
}

/** A catalog id is a match. A blank id is a new item and does not block posting. */
export function lineHasMatchedProduct(line: { product_id?: string | null }): boolean {
  return Boolean(line.product_id?.trim());
}

/**
 * A cost that was read as $0. An unreadable cost is a different gap and stays blocked.
 * These lines stay on the draft for review and are not stock receipts.
 */
export function isZeroDollarDraftLine(line: {
  unit_cost?: number;
  cost_unreadable?: boolean;
}): boolean {
  if (line.cost_unreadable === true) return false;
  return typeof line.unit_cost === 'number' && Number.isFinite(line.unit_cost) && line.unit_cost === 0;
}

function lineExtendedAmount(line: { quantity: number; unit_cost: number }): number {
  const quantity = line.quantity > 0 ? line.quantity : 0;
  const cost = Number.isFinite(line.unit_cost) ? line.unit_cost : 0;
  return Number((quantity * cost).toFixed(2));
}

function isUnreadName(name: string | undefined): boolean {
  const trimmed = name?.trim() ?? '';
  return !trimmed || trimmed.startsWith('Unread line ');
}

export function reviewReasonsForLine(line: {
  item_name?: string;
  line_name?: string;
  quantity: number;
  line_confidence: number;
  requires_approval: boolean;
  department_assumed?: boolean;
  quantity_unreadable?: boolean;
  name_unreadable?: boolean;
  cost_unreadable?: boolean;
  unit_invalid?: boolean;
  line_total_mismatch?: boolean;
  unit_cost?: number;
  review_reasons?: OcrReviewReason[];
}): OcrReviewReason[] {
  if (line.review_reasons) return [...line.review_reasons];
  if (isZeroDollarDraftLine(line)) return [];
  const reasons: OcrReviewReason[] = [];
  const name = line.line_name ?? line.item_name;
  if (line.name_unreadable || isUnreadName(name)) reasons.push('name_unreadable');
  if (line.quantity_unreadable || !(line.quantity > 0)) reasons.push('quantity_unreadable');
  if (line.department_assumed) reasons.push('department_assumed');
  if (line.cost_unreadable) reasons.push('cost_unreadable');
  if (line.unit_invalid) reasons.push('unit_invalid');
  if (line.line_total_mismatch) reasons.push('line_total_mismatch');
  if (line.requires_approval) reasons.push('cost_guardrail');
  if (lineNeedsManualReview(line.line_confidence)) reasons.push('low_confidence');
  return reasons;
}

/** Every extracted line is stored, including ones that cannot post yet. */
export function buildAuthoritativeOcrDraft(input: {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceDateNeedsConfirm?: boolean;
  invoiceDateConfirmReason?: string | null;
  totalAmount: number;
  /** Printed subtotal from the page. Absent when the page did not print one. */
  printedSubtotal?: number;
  departmentBreakdown: Record<string, number>;
  lines: AuditedDraftSourceLine[];
}): OcrDraftPayload {
  const lines: OcrDraftLine[] = input.lines.map((line) => {
    const nameUnreadable = isUnreadName(line.item_name);
    const quantityUnreadable = line.quantity_unreadable === true || !(line.quantity > 0);
    const departmentAssumed = line.department_assumed === true;
    const costUnreadable = line.cost_unreadable === true;
    const unitInvalid = line.unit_invalid === true;
    const lineTotalMismatch = line.line_total_mismatch === true;
    const zeroDollar = isZeroDollarDraftLine({
      unit_cost: line.unit_cost,
      cost_unreadable: costUnreadable,
    });
    const review_reasons = reviewReasonsForLine({
      line_name: line.item_name,
      quantity: line.quantity,
      unit_cost: line.unit_cost,
      line_confidence: line.line_confidence,
      requires_approval: line.requires_approval,
      department_assumed: departmentAssumed,
      quantity_unreadable: quantityUnreadable,
      name_unreadable: nameUnreadable,
      cost_unreadable: costUnreadable,
      unit_invalid: unitInvalid,
      line_total_mismatch: lineTotalMismatch,
      review_reasons: undefined,
    });
    const printedName = printedMatchValue(line.printed_name || line.item_name);
    const supplierCode = printedMatchValue(line.supplier_code);
    return {
      product_id: line.product_id?.trim() ?? '',
      quantity: quantityUnreadable ? 0 : line.quantity,
      quantity_kind: quantityKindForInvoiceUnit(line.unit) as OcrQuantityKind,
      unit_cost: line.unit_cost,
      line_name: line.item_name,
      ...(printedName && normalizeLineNameKey(printedName) ? { printed_name: printedName } : {}),
      ...(supplierCode && normalizeSupplierCode(supplierCode) ? { supplier_code: supplierCode } : {}),
      ...(line.match_source ? { match_source: line.match_source } : {}),
      ...(line.match_printed_value?.trim()
        ? { match_printed_value: line.match_printed_value.trim() }
        : {}),
      ...(line.matched_product_name?.trim()
        ? { matched_product_name: line.matched_product_name.trim() }
        : {}),
      ...(line.fuzzy_ambiguous ? { fuzzy_ambiguous: true } : {}),
      department: line.department as Department,
      case_pack_size: line.case_pack_size,
      line_confidence: line.line_confidence,
      requires_approval: line.requires_approval,
      department_assumed: departmentAssumed,
      quantity_unreadable: quantityUnreadable,
      name_unreadable: nameUnreadable,
      cost_unreadable: costUnreadable,
      unit_invalid: unitInvalid,
      line_total_mismatch: lineTotalMismatch,
      ...(line.line_total_note
        ? { line_total_note: line.line_total_note }
        : zeroDollar
          ? { line_total_note: ZERO_DOLLAR_REVIEW_REASON }
          : {}),
      review_reasons,
    };
  });
  const confirmReason = input.invoiceDateConfirmReason?.trim() ?? '';
  const lineAmounts = lines.map((line) => lineExtendedAmount(line));
  const totalAmount = selectInvoiceHeaderTotal({
    printedSubtotal: input.printedSubtotal,
    lineAmounts: lineAmounts.length > 0 ? lineAmounts : [input.totalAmount],
  });
  return {
    vendorName: input.vendorName.trim(),
    invoiceNumber: input.invoiceNumber.trim(),
    invoiceDate: input.invoiceDate,
    ...(input.invoiceDateNeedsConfirm
      ? {
          invoiceDateNeedsConfirm: true,
          ...(confirmReason ? { invoiceDateConfirmReason: confirmReason } : {}),
        }
      : {}),
    totalAmount,
    ...(typeof input.printedSubtotal === 'number' && Number.isFinite(input.printedSubtotal)
      ? { printedSubtotal: input.printedSubtotal }
      : {}),
    departmentBreakdown: input.departmentBreakdown,
    lines,
  };
}

export function unresolvedLineReasons(
  line: OcrDraftLine,
  manualReviewOverride: boolean
): OcrReviewReason[] {
  return reviewReasonsForLine(line).filter((reason) => {
    if (HARD_REVIEW_REASONS.has(reason)) return true;
    if (MANAGER_REVIEW_REASONS.has(reason)) return !manualReviewOverride;
    return true;
  });
}

/** Hard gaps always block. Confidence, cost, an assumed department, and a line-total gap need a manager. */
export function draftPostingBlockers(
  payload: Pick<
    OcrDraftPayload,
    | 'vendorName'
    | 'invoiceNumber'
    | 'invoiceDate'
    | 'invoiceDateNeedsConfirm'
    | 'invoiceDateConfirmReason'
    | 'lines'
    | 'scanStatus'
    | 'scanAudited'
    | 'pageScanBlockers'
    | 'pageScanReviewFlags'
  >,
  options: { actorIsManager: boolean; manualReviewOverride: boolean }
): string[] {
  const blockers: string[] = [];
  if (payload.scanStatus === 'scanning' || (payload.scanStatus === 'ready' && payload.scanAudited !== true)) {
    blockers.push('This invoice is still being read.');
  }
  if (payload.scanStatus === 'failed') {
    blockers.push('A page was not read. Retake that page before confirming.');
  }
  const managerMayResolveEarly = options.manualReviewOverride && options.actorIsManager;
  const pageBlockers = managerMayResolveEarly
    ? reviewBlockersAfterApproval({
        manager: true,
        approved: true,
        blockers: payload.pageScanBlockers ?? [],
      })
    : (payload.pageScanBlockers ?? []);
  for (const blocker of pageBlockers) {
    if (blocker.trim()) blockers.push(blocker);
  }
  if (!managerMayResolveEarly) {
    for (const flag of payload.pageScanReviewFlags ?? []) {
      if (flag.trim()) blockers.push(flag);
    }
  }
  if (payload.lines.length > MAX_RECEIVING_BATCH_SIZE) {
    blockers.push(
      `This invoice has ${payload.lines.length} lines. ${MAX_RECEIVING_BATCH_SIZE} lines is the maximum.`
    );
  }
  if (!payload.vendorName.trim()) blockers.push('Vendor name was not read.');
  if (!payload.invoiceNumber.trim()) blockers.push('Invoice number was not read.');
  if (!payload.invoiceDate?.trim()) blockers.push('Invoice date was not read.');
  if (payload.invoiceDateNeedsConfirm) {
    blockers.push(
      payload.invoiceDateConfirmReason?.trim() || 'Invoice date was guessed and needs confirmation.'
    );
  }
  const managerMayResolve = options.manualReviewOverride && options.actorIsManager;
  payload.lines.forEach((line, index) => {
    if (isZeroDollarDraftLine(line)) return;
    const reasons = unresolvedLineReasons(line, managerMayResolve);
    if (line.pack_needs_manager && !line.pack_edited_by && !options.actorIsManager) {
      const pack = line.case_pack_size ?? 1;
      const split = line.split_factor ?? 1;
      blockers.push(
        `Line ${index + 1} pack is ${pack} and split is ${split}. A manager must confirm a pack change.`
      );
    }
    if (reasons.length === 0) return;
    blockers.push(`Line ${index + 1} is unresolved (${reasons.join(', ')}).`);
  });
  if (payload.lines.length === 0) blockers.push('The scan has no invoice lines.');
  return [...new Set(blockers)];
}

function withoutReason(reasons: OcrReviewReason[] | undefined, reason: OcrReviewReason): OcrReviewReason[] {
  return (reasons ?? []).filter((entry) => entry !== reason);
}

export interface DraftResolutionActor {
  actorIsManager: boolean;
  manualReviewOverride: boolean;
}

const DENY_MANAGER_RESOLUTION: DraftResolutionActor = {
  actorIsManager: false,
  manualReviewOverride: false,
};

function recomputeDraftEconomics(payload: OcrDraftPayload): OcrDraftPayload {
  const departmentBreakdown: Record<string, number> = {
    PRODUCE: 0,
    DAIRY: 0,
    BAKERY: 0,
    PANTRY: 0,
    DELI_KITCHEN: 0,
    GROCERY: 0,
  };
  const lineAmounts: number[] = [];
  for (const line of payload.lines) {
    const extended = lineExtendedAmount(line);
    lineAmounts.push(extended);
    const department = line.department ?? 'PRODUCE';
    departmentBreakdown[department] = Number(
      ((departmentBreakdown[department] ?? 0) + extended).toFixed(2)
    );
  }
  return {
    ...payload,
    totalAmount: selectInvoiceHeaderTotal({
      printedSubtotal: payload.printedSubtotal,
      lineAmounts,
    }),
    departmentBreakdown,
  };
}

/**
 * Facts used to detect a conflicting resolution of the same draft.
 * Line order is not part of the fingerprint. Delivery ids are.
 */
export function draftResolutionFingerprint(payload: OcrDraftPayload): string {
  const lines = [...payload.lines].sort((a, b) =>
    `${a.product_id}|${a.line_name ?? ''}`.localeCompare(`${b.product_id}|${b.line_name ?? ''}`)
  );
  return JSON.stringify({
    vendorName: payload.vendorName.trim(),
    invoiceNumber: payload.invoiceNumber.trim(),
    invoiceDate: payload.invoiceDate,
    invoiceDateNeedsConfirm: payload.invoiceDateNeedsConfirm === true,
    lines: lines.map((line) => ({
      name: line.line_name ?? '',
      quantity: line.quantity,
      unitCost: line.unit_cost,
      department: line.department ?? '',
      productId: line.product_id,
      departmentAssumed: line.department_assumed === true,
    })),
  });
}

/** Corrections clear only the gap they actually fill. A clerk cannot clear an assumed department. */
export function applyOcrDraftResolutions(
  payload: OcrDraftPayload,
  resolution: OcrDraftResolution,
  actor: DraftResolutionActor = DENY_MANAGER_RESOLUTION
): OcrDraftPayload {
  const next: OcrDraftPayload = {
    ...payload,
    lines: payload.lines.map((line) => ({
      ...line,
      review_reasons: [...(line.review_reasons ?? reviewReasonsForLine(line))],
    })),
  };
  const vendorName = resolution.vendorName?.trim();
  if (vendorName) next.vendorName = vendorName;
  const invoiceNumber = resolution.invoiceNumber?.trim();
  if (invoiceNumber) next.invoiceNumber = invoiceNumber;
  const invoiceDate = resolution.invoiceDate?.trim();
  if (invoiceDate) {
    next.invoiceDate = invoiceDate;
    next.invoiceDateNeedsConfirm = false;
    delete next.invoiceDateConfirmReason;
  }

  for (const edit of resolution.lines ?? []) {
    const line = next.lines[edit.index];
    if (!line) continue;
    const name = edit.line_name?.trim();
    if (name && !name.startsWith('Unread line ')) {
      line.line_name = name;
      line.name_unreadable = false;
      line.review_reasons = withoutReason(line.review_reasons, 'name_unreadable');
    }
    if (typeof edit.quantity === 'number' && edit.quantity > 0) {
      line.quantity = edit.quantity;
      line.quantity_unreadable = false;
      line.review_reasons = withoutReason(line.review_reasons, 'quantity_unreadable');
    }
    if (edit.unlink === true) line.unlink_match = true;
    if (edit.create_new === true) {
      line.create_new = true;
      line.product_id = '';
      line.product_picked = false;
      line.remember = false;
    }
    const productId = edit.product_id?.trim();
    if (productId) {
      line.product_id = productId;
      line.product_picked = true;
      line.create_new = false;
    }
    if (typeof edit.remember === 'boolean' && line.create_new !== true) {
      line.remember = edit.remember;
    }
    const managerMayClearAssumed = actor.actorIsManager && actor.manualReviewOverride;
    if (edit.department && line.department_assumed) {
      if (managerMayClearAssumed) {
        line.department = edit.department;
        line.department_assumed = false;
        line.review_reasons = withoutReason(line.review_reasons, 'department_assumed');
      }
    } else if (edit.department && !line.department_assumed) {
      line.department = edit.department;
    }
  }
  return recomputeDraftEconomics(next);
}
