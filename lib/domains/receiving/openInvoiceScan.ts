import type { Department } from '@prisma/client';
import type { OcrDraftLine, OcrDraftPayload } from '@/lib/domains/receiving/invoiceOcrCommit';
import { gateStoredOcrDraft } from '@/lib/domains/receiving/sampleReceivingGuard';
import type { InvoiceOcrResult } from '@/lib/types';

const DEPARTMENTS = new Set<Department>([
  'PRODUCE',
  'DAIRY',
  'BAKERY',
  'PANTRY',
  'DELI_KITCHEN',
  'GROCERY',
]);

const EMPTY_BREAKDOWN: InvoiceOcrResult['departmentBreakdown'] = {
  PRODUCE: 0,
  DAIRY: 0,
  BAKERY: 0,
  PANTRY: 0,
  DELI_KITCHEN: 0,
  GROCERY: 0,
};

export interface OpenScanRow {
  id: string;
  staffId: string;
  payload: unknown;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

function departmentOf(value: unknown): Department {
  return typeof value === 'string' && DEPARTMENTS.has(value as Department)
    ? (value as Department)
    : 'PRODUCE';
}

function readPayload(raw: unknown): OcrDraftPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const payload = raw as Partial<OcrDraftPayload>;
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) return null;
  return {
    vendorName: typeof payload.vendorName === 'string' ? payload.vendorName : '',
    invoiceNumber: typeof payload.invoiceNumber === 'string' ? payload.invoiceNumber : '',
    invoiceDate: typeof payload.invoiceDate === 'string' ? payload.invoiceDate : '',
    totalAmount: Number(payload.totalAmount) || 0,
    departmentBreakdown:
      payload.departmentBreakdown && typeof payload.departmentBreakdown === 'object'
        ? payload.departmentBreakdown
        : {},
    lines: payload.lines as OcrDraftLine[],
  };
}

function breakdownOf(raw: Record<string, number> | undefined): InvoiceOcrResult['departmentBreakdown'] {
  const next = { ...EMPTY_BREAKDOWN };
  if (!raw) return next;
  for (const key of Object.keys(next) as Array<keyof typeof next>) {
    const value = raw[key];
    if (typeof value === 'number' && Number.isFinite(value)) next[key] = value;
  }
  return next;
}

/** Rebuild the receive-screen invoice from the stored OCR draft. Line indexes stay aligned. */
export function invoiceResultFromStoredDraft(row: {
  id: string;
  payload: unknown;
}): InvoiceOcrResult | null {
  const payload = readPayload(row.payload);
  if (!payload) return null;
  const supplierRaw =
    row.payload && typeof row.payload === 'object'
      ? (row.payload as { supplierId?: unknown }).supplierId
      : undefined;
  const supplierId = typeof supplierRaw === 'string' ? supplierRaw.trim() : '';
  const lineItems = payload.lines.map((line, index) => {
    const quantity = Number(line.quantity) > 0 ? Number(line.quantity) : 0;
    const unitCost = Number(line.unit_cost) >= 0 ? Number(line.unit_cost) : 0;
    const kind = line.quantity_kind === 'cases' ? 'cases' : 'units';
    const name = line.line_name?.trim() || `Unread line ${index + 1}`;
    return {
      name,
      department: departmentOf(line.department),
      quantity,
      unit: kind,
      casePackSize: Number(line.case_pack_size) > 0 ? Number(line.case_pack_size) : 1,
      subUnit: 'units',
      unitCost,
      totalCost: Number((quantity * unitCost).toFixed(2)),
      productId: line.product_id?.trim() || null,
      lineConfidence: line.line_confidence,
      requires_approval: line.requires_approval === true,
      needsManualReview: line.requires_approval === true,
    };
  });
  return {
    vendorName: payload.vendorName.trim(),
    invoiceNumber: payload.invoiceNumber.trim(),
    invoiceDate: payload.invoiceDate,
    totalAmount: payload.totalAmount,
    departmentBreakdown: breakdownOf(payload.departmentBreakdown),
    lineItems,
    draftId: row.id,
    ...(supplierId ? { supplierId } : {}),
  };
}

/** Newest unconsumed, unexpired scan for this clerk. Sample invoices stay off the board. */
export function pickOpenInvoiceScan(
  rows: OpenScanRow[],
  staffId: string,
  now = new Date()
): OpenScanRow | null {
  const open = rows
    .filter(
      (row) =>
        row.staffId === staffId &&
        row.consumedAt === null &&
        row.expiresAt.getTime() > now.getTime()
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const row of open) {
    const payload = readPayload(row.payload);
    if (!payload) continue;
    const gate = gateStoredOcrDraft(
      { expiresAt: row.expiresAt, payload: { invoiceNumber: payload.invoiceNumber } },
      now.getTime()
    );
    if (!gate.ok) continue;
    if (!invoiceResultFromStoredDraft(row)) continue;
    return row;
  }
  return null;
}
