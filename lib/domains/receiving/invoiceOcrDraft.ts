import type { Department } from '@prisma/client';
import { lineNeedsManualReview } from '@/lib/domains/receiving/invoiceOcrConfidence';
import {
  quantityKindForInvoiceUnit,
  type OcrDraftLine,
  type OcrDraftPayload,
  type OcrQuantityKind,
} from '@/lib/domains/receiving/invoiceOcrCommit';

export const OCR_REVIEW_REASONS = [
  'low_confidence',
  'cost_guardrail',
  'department_assumed',
  'quantity_unreadable',
  'name_unreadable',
] as const;

export type OcrReviewReason = (typeof OCR_REVIEW_REASONS)[number];

const HARD_REVIEW_REASONS = new Set<OcrReviewReason>([
  'quantity_unreadable',
  'name_unreadable',
]);

const MANAGER_REVIEW_REASONS = new Set<OcrReviewReason>([
  'low_confidence',
  'cost_guardrail',
  'department_assumed',
]);

export interface AuditedDraftSourceLine {
  item_name: string;
  product_id: string | null;
  quantity: number;
  unit: string;
  unit_cost: number;
  department: Department | 'PRODUCE' | 'DAIRY' | 'BAKERY' | 'PANTRY';
  case_pack_size: number;
  line_confidence: number;
  requires_approval: boolean;
  department_assumed?: boolean;
  quantity_unreadable?: boolean;
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
  }>;
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
  review_reasons?: OcrReviewReason[];
}): OcrReviewReason[] {
  if (line.review_reasons) return [...line.review_reasons];
  const reasons: OcrReviewReason[] = [];
  const name = line.line_name ?? line.item_name;
  if (line.name_unreadable || isUnreadName(name)) reasons.push('name_unreadable');
  if (line.quantity_unreadable || !(line.quantity > 0)) reasons.push('quantity_unreadable');
  if (line.department_assumed) reasons.push('department_assumed');
  if (line.requires_approval) reasons.push('cost_guardrail');
  if (lineNeedsManualReview(line.line_confidence)) reasons.push('low_confidence');
  return reasons;
}

/** Every extracted line is stored, including ones that cannot post yet. */
export function buildAuthoritativeOcrDraft(input: {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  departmentBreakdown: Record<string, number>;
  lines: AuditedDraftSourceLine[];
}): OcrDraftPayload {
  const lines: OcrDraftLine[] = input.lines.map((line) => {
    const nameUnreadable = isUnreadName(line.item_name);
    const quantityUnreadable = line.quantity_unreadable === true || !(line.quantity > 0);
    const departmentAssumed = line.department_assumed === true;
    const review_reasons = reviewReasonsForLine({
      line_name: line.item_name,
      quantity: line.quantity,
      line_confidence: line.line_confidence,
      requires_approval: line.requires_approval,
      department_assumed: departmentAssumed,
      quantity_unreadable: quantityUnreadable,
      name_unreadable: nameUnreadable,
      review_reasons: undefined,
    });
    return {
      product_id: line.product_id?.trim() ?? '',
      quantity: quantityUnreadable ? 0 : line.quantity,
      quantity_kind: quantityKindForInvoiceUnit(line.unit) as OcrQuantityKind,
      unit_cost: line.unit_cost,
      line_name: line.item_name,
      department: line.department as Department,
      case_pack_size: line.case_pack_size,
      line_confidence: line.line_confidence,
      requires_approval: line.requires_approval,
      department_assumed: departmentAssumed,
      quantity_unreadable: quantityUnreadable,
      name_unreadable: nameUnreadable,
      review_reasons,
    };
  });
  return {
    vendorName: input.vendorName.trim(),
    invoiceNumber: input.invoiceNumber.trim(),
    invoiceDate: input.invoiceDate,
    totalAmount: input.totalAmount,
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

/** Hard gaps always block. Confidence, cost, and assumed department need a manager. */
export function draftPostingBlockers(
  payload: Pick<OcrDraftPayload, 'vendorName' | 'invoiceNumber' | 'lines'>,
  options: { actorIsManager: boolean; manualReviewOverride: boolean }
): string[] {
  const blockers: string[] = [];
  if (!payload.vendorName.trim()) blockers.push('Vendor name was not read.');
  if (!payload.invoiceNumber.trim()) blockers.push('Invoice number was not read.');
  const managerMayResolve = options.manualReviewOverride && options.actorIsManager;
  payload.lines.forEach((line, index) => {
    const reasons = unresolvedLineReasons(line, managerMayResolve);
    if (reasons.length === 0) return;
    blockers.push(`Line ${index + 1} is unresolved (${reasons.join(', ')}).`);
  });
  if (payload.lines.length === 0) blockers.push('The scan has no invoice lines.');
  return blockers;
}

function withoutReason(reasons: OcrReviewReason[] | undefined, reason: OcrReviewReason): OcrReviewReason[] {
  return (reasons ?? []).filter((entry) => entry !== reason);
}

/** Corrections clear only the gap they actually fill. They do not clear a manager review. */
export function applyOcrDraftResolutions(
  payload: OcrDraftPayload,
  resolution: OcrDraftResolution
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
  if (invoiceDate) next.invoiceDate = invoiceDate;

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
    if (edit.department) {
      line.department = edit.department;
      line.department_assumed = false;
      line.review_reasons = withoutReason(line.review_reasons, 'department_assumed');
    }
  }
  return next;
}
