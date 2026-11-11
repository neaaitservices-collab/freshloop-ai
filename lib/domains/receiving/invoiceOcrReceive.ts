import { Department, Prisma } from '@prisma/client';
import { z } from 'zod';
import { InventoryLedgerError, prisma } from '@/lib/domains/inventory/ledger';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import { receivingDepartment } from '@/lib/domains/inventory/receivingDepartment';
import {
  applyOcrDraftResolutions,
  draftPostingBlockers,
  type OcrDraftResolution,
} from '@/lib/domains/receiving/invoiceOcrDraft';
import {
  type OcrDraftLine,
  type OcrDraftPayload,
} from '@/lib/domains/receiving/invoiceOcrCommit';
import {
  assertReceivingDepartmentsChosen,
  postReceivingLogToInventory,
  validateReceivingLogPostInput,
  type ReceivingLogPostInput,
  type ReceivingLogPostResult,
} from '@/lib/domains/receiving/receivingLogPost';
import { gateStoredOcrDraft } from '@/lib/domains/receiving/sampleReceivingGuard';
import { getSupplierNameById } from '@/lib/domains/suppliers/suppliers';

const receiveResolutionsSchema = z
  .object({
    vendorName: z.string().trim().min(1).max(256).optional(),
    invoiceNumber: z.string().trim().min(1).max(128).optional(),
    invoiceDate: z.string().trim().min(1).max(32).optional(),
    lines: z
      .array(
        z
          .object({
            index: z.number().int().nonnegative().max(500),
            line_name: z.string().trim().min(1).max(256).optional(),
            quantity: z.number().finite().positive().max(1_000_000).optional(),
            department: z.nativeEnum(Department).optional(),
            packSize: z.number().finite().positive().max(1_000_000).optional(),
            splitFactor: z.number().finite().positive().max(1_000_000).optional(),
          })
          .strict()
      )
      .max(500)
      .optional(),
  })
  .strict();

type ReceiveResolutions = z.infer<typeof receiveResolutionsSchema>;

export const OCR_CLIENT_COPY_REJECTED =
  'Stock was not posted. There is no accepted invoice scan on the server. The browser copy of the scan cannot add stock.';

export const OCR_DRAFT_NOT_ACCEPTED =
  'Stock was not posted. Accept the saved invoice scan before it can be received.';

export interface OcrDraftRecord {
  id: string;
  staffId: string;
  payload: unknown;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface InvoiceOcrReceiveFailure {
  ok: false;
  status: 400 | 404 | 409;
  error: string;
  code: string;
}

export interface InvoiceOcrReceiveSuccess {
  ok: true;
  lines: ReceivingLogPostInput[];
  results: ReceivingLogPostResult[];
}

export interface InvoiceOcrPostEntry {
  line: ReceivingLogPostInput;
  draftLineIndex: number;
}

export interface InvoiceOcrReceiveDeps {
  findDraft: (id: string) => Promise<OcrDraftRecord | null>;
  postLines: (input: {
    draft: OcrDraftRecord;
    resolved: OcrDraftPayload;
    entries: InvoiceOcrPostEntry[];
    actorId: string;
  }) => Promise<ReceivingLogPostResult[]>;
}

export function isInvoiceOcrReceiveRequest(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const record = body as Record<string, unknown>;
  if (record.invoiceOcr === true) return true;
  if (typeof record.draftId === 'string' && record.draftId.trim().length > 0) return true;
  return record.acceptDraft !== undefined;
}

function failure(
  status: InvoiceOcrReceiveFailure['status'],
  error: string,
  code: string
): InvoiceOcrReceiveFailure {
  return { ok: false, status, error, code };
}

/** Expired, consumed, and sample drafts fail before any stock write. */
export function draftReceiveBlock(draft: {
  consumedAt: Date | null;
  expiresAt: Date;
  payload: { invoiceNumber?: string | null; vendorName?: string | null };
}): InvoiceOcrReceiveFailure | null {
  if (draft.consumedAt) {
    return failure(409, 'This scan was already received.', 'DRAFT_ALREADY_RECEIVED');
  }
  const gate = gateStoredOcrDraft({ expiresAt: draft.expiresAt, payload: draft.payload });
  if (gate.ok) return null;
  const code = /expired/i.test(gate.error)
    ? 'OCR_DRAFT_EXPIRED'
    : gate.status === 404
      ? 'OCR_DRAFT_MISSING'
      : 'OCR_DRAFT_BLOCKED';
  return failure(gate.status, gate.error, code);
}

function draftPackSize(line: OcrDraftLine): number {
  const pack = Number(line.case_pack_size);
  if (Number.isFinite(pack) && pack > 0 && pack <= 1_000_000) return pack;
  return 1;
}

function readPayload(raw: unknown): OcrDraftPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const payload = raw as Partial<OcrDraftPayload>;
  if (!Array.isArray(payload.lines)) return null;
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

function postedLineIndexes(raw: unknown): number[] {
  if (!raw || typeof raw !== 'object') return [];
  const value = (raw as { postedLineIndexes?: unknown }).postedLineIndexes;
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is number => Number.isInteger(entry) && entry >= 0))];
}

function requestItems(body: Record<string, unknown>): unknown[] {
  if (Array.isArray(body.items)) return body.items;
  return [body];
}

interface ClientReceiveLine {
  draftLineIndex?: number;
  externalLogId?: string;
  retailUnit?: string;
  marginMode?: string;
  customMarginPercent?: number;
  currentRetailPrice?: number;
  caseRetailPrice?: number | null;
  department?: string;
  screenDepartment?: string;
  category?: string;
  supplierId?: string;
}

function readClientLine(raw: unknown): ClientReceiveLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const margin = row.marginMode;
  return {
    draftLineIndex: typeof row.draftLineIndex === 'number' ? row.draftLineIndex : undefined,
    externalLogId: typeof row.externalLogId === 'string' ? row.externalLogId : undefined,
    retailUnit: typeof row.retailUnit === 'string' ? row.retailUnit : undefined,
    marginMode: margin === '35' || margin === '40' || margin === 'custom' ? margin : undefined,
    customMarginPercent: typeof row.customMarginPercent === 'number' ? row.customMarginPercent : undefined,
    currentRetailPrice: typeof row.currentRetailPrice === 'number' ? row.currentRetailPrice : undefined,
    caseRetailPrice:
      typeof row.caseRetailPrice === 'number' || row.caseRetailPrice === null
        ? (row.caseRetailPrice as number | null)
        : undefined,
    department: typeof row.department === 'string' ? row.department : undefined,
    screenDepartment: typeof row.screenDepartment === 'string' ? row.screenDepartment : undefined,
    category: typeof row.category === 'string' ? row.category : undefined,
    supplierId: typeof row.supplierId === 'string' ? row.supplierId : undefined,
  };
}

function gapResolutions(payload: OcrDraftPayload, items: Array<{ index: number; department?: string }>): OcrDraftResolution {
  const lines: NonNullable<OcrDraftResolution['lines']> = [];
  for (const item of items) {
    const line = payload.lines[item.index];
    const department = receivingDepartment(item.department);
    if (!line || !department) continue;
    if (line.department_assumed || !line.department) {
      lines.push({ index: item.index, department });
    }
  }
  return lines.length > 0 ? { lines } : {};
}

function idempotentLine(entry: InvoiceOcrPostEntry): ReceivingLogPostResult {
  return {
    externalLogId: entry.line.externalLogId,
    itemName: entry.line.itemName,
    stock: {
      posted: true,
      idempotent: true,
      unitsAdded: 0,
      onHand: 0,
      productId: entry.line.productId ?? '',
      productName: entry.line.itemName,
      transactionId: '',
      reason: 'This invoice line was already received. Stock was not added again.',
    },
  };
}

async function postDraftLines(input: {
  draft: OcrDraftRecord;
  resolved: OcrDraftPayload;
  entries: InvoiceOcrPostEntry[];
  actorId: string;
}): Promise<ReceivingLogPostResult[]> {
  const supplierId = input.entries.find((entry) => entry.line.supplierId)?.line.supplierId;
  const supplierName = supplierId ? await getSupplierNameById(supplierId) : null;
  await assertReceivingDepartmentsChosen(
    input.entries.map((entry) => entry.line),
    supplierName
  );

  const results = await prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ payload: unknown; consumed_at: Date | null; expires_at: Date }>
      >`
        SELECT payload, consumed_at, expires_at FROM invoice_ocr_drafts WHERE id = ${input.draft.id} FOR UPDATE
      `;
      if (!locked[0]) {
        throw new InventoryLedgerError(
          'Invoice scan was not found. Scan the invoice again.',
          'OCR_DRAFT_MISSING',
          404
        );
      }
      const lockedPayload = readPayload(locked[0].payload);
      if (!lockedPayload) {
        throw new InventoryLedgerError(
          'The saved invoice scan could not be read. Scan the invoice again.',
          'OCR_DRAFT_UNREADABLE',
          409
        );
      }
      const blocked = draftReceiveBlock({
        consumedAt: locked[0].consumed_at ? new Date(locked[0].consumed_at) : null,
        expiresAt: new Date(locked[0].expires_at),
        payload: lockedPayload ?? { invoiceNumber: '' },
      });
      if (blocked) {
        throw new InventoryLedgerError(blocked.error, blocked.code, blocked.status);
      }
      const already = new Set(postedLineIndexes(locked[0].payload));
      const rows: ReceivingLogPostResult[] = [];
      const postedNow: number[] = [];
      for (const entry of input.entries) {
        if (already.has(entry.draftLineIndex)) {
          rows.push(idempotentLine(entry));
          continue;
        }
        const row = await postReceivingLogToInventory(entry.line, input.actorId, supplierName, tx, true);
        if (!row.stock.posted) {
          throw new InventoryLedgerError(row.stock.reason ?? 'Stock was not updated.', 'DELIVERY_CONFLICT', 409);
        }
        rows.push(row);
        postedNow.push(entry.draftLineIndex);
      }
      if (postedNow.length > 0) {
        await tx.invoiceOcrDraft.update({
          where: { id: input.draft.id },
          data: {
            payload: {
              ...input.resolved,
              postedLineIndexes: [...already, ...postedNow],
            } as unknown as Prisma.InputJsonValue,
          },
        });
      }
      return rows;
    },
    { timeout: 20_000 }
  );
  invalidateInventoryCaches();
  return results;
}

const defaultDeps: InvoiceOcrReceiveDeps = {
  findDraft: async (id) =>
    prisma.invoiceOcrDraft.findUnique({
      where: { id },
      select: { id: true, staffId: true, payload: true, expiresAt: true, consumedAt: true },
    }),
  postLines: postDraftLines,
};

/**
 * Posts an invoice scan from the stored draft.
 * Client quantities, costs, names, and product ids are not read.
 * Pack size comes from the stored line. A pack or split change is accepted only as a resolution.
 * Explicit `resolutions` are the only user edits applied to the stored scan.
 */
export async function receiveAcceptedInvoiceOcr(input: {
  actorId: string;
  actorIsManager: boolean;
  body: Record<string, unknown>;
  deps?: InvoiceOcrReceiveDeps;
}): Promise<InvoiceOcrReceiveSuccess | InvoiceOcrReceiveFailure> {
  const deps = input.deps ?? defaultDeps;
  const body = input.body;
  const draftId = typeof body.draftId === 'string' ? body.draftId.trim() : '';
  if (!draftId) {
    return failure(400, OCR_CLIENT_COPY_REJECTED, 'OCR_DRAFT_REQUIRED');
  }

  const draft = await deps.findDraft(draftId);
  if (!draft) {
    return failure(404, 'Invoice scan was not found. Scan the invoice again.', 'OCR_DRAFT_MISSING');
  }
  if (body.acceptDraft !== true) {
    return failure(409, OCR_DRAFT_NOT_ACCEPTED, 'OCR_DRAFT_NOT_ACCEPTED');
  }

  const stored = readPayload(draft.payload);
  if (!stored) {
    return failure(409, 'The saved invoice scan could not be read. Scan the invoice again.', 'OCR_DRAFT_UNREADABLE');
  }
  const blocked = draftReceiveBlock({
    consumedAt: draft.consumedAt,
    expiresAt: draft.expiresAt,
    payload: stored,
  });
  if (blocked) return blocked;

  let resolutions: ReceiveResolutions = {};
  if (body.resolutions !== undefined) {
    const parsed = receiveResolutionsSchema.safeParse(body.resolutions);
    if (!parsed.success) {
      return failure(400, 'Those invoice corrections could not be read.', 'OCR_RESOLUTION_INVALID');
    }
    resolutions = parsed.data;
  }
  const packEdits = new Map<number, { packSize?: number; splitFactor?: number }>();
  for (const edit of resolutions.lines ?? []) {
    if (edit.packSize !== undefined || edit.splitFactor !== undefined) {
      packEdits.set(edit.index, { packSize: edit.packSize, splitFactor: edit.splitFactor });
    }
  }
  const draftResolutions: OcrDraftResolution = {
    vendorName: resolutions.vendorName,
    invoiceNumber: resolutions.invoiceNumber,
    invoiceDate: resolutions.invoiceDate,
    lines: resolutions.lines?.map((edit) => ({
      index: edit.index,
      line_name: edit.line_name,
      quantity: edit.quantity,
      department: edit.department,
    })),
  };

  const rawItems = requestItems(body);
  if (rawItems.length === 0) {
    return failure(400, 'Choose the invoice lines to receive from the saved scan.', 'OCR_LINES_REQUIRED');
  }
  const clientLines: ClientReceiveLine[] = [];
  for (const raw of rawItems) {
    const line = readClientLine(raw);
    if (!line) return failure(400, 'One invoice line could not be read.', 'OCR_LINE_UNREADABLE');
    clientLines.push(line);
  }
  const indexed: Array<ClientReceiveLine & { index: number }> = [];
  for (const line of clientLines) {
    if (typeof line.draftLineIndex !== 'number' || !Number.isInteger(line.draftLineIndex)) {
      return failure(400, 'A line in this request is not on the saved invoice scan.', 'OCR_LINE_NOT_ON_DRAFT');
    }
    indexed.push({ ...line, index: line.draftLineIndex });
  }
  const seen = new Set<number>();
  for (const line of indexed) {
    if (!Number.isInteger(line.index) || line.index < 0 || line.index >= stored.lines.length) {
      return failure(400, 'A line in this request is not on the saved invoice scan.', 'OCR_LINE_NOT_ON_DRAFT');
    }
    if (seen.has(line.index)) {
      return failure(400, 'The same saved invoice line was sent more than once.', 'OCR_LINE_DUPLICATE');
    }
    seen.add(line.index);
  }

  const actor = {
    actorIsManager: input.actorIsManager,
    manualReviewOverride: body.manualReviewOverride === true,
  };
  const resolved = applyOcrDraftResolutions(
    applyOcrDraftResolutions(stored, gapResolutions(stored, indexed), actor),
    draftResolutions,
    actor
  );
  const blockers = draftPostingBlockers(resolved, actor);
  if (blockers.length > 0) {
    return failure(409, blockers[0] ?? OCR_DRAFT_NOT_ACCEPTED, 'OCR_DRAFT_BLOCKED');
  }

  const supplierId = typeof body.supplierId === 'string' ? body.supplierId.trim() : '';
  const entries: InvoiceOcrPostEntry[] = [];
  const skipped: ReceivingLogPostResult[] = [];
  for (const client of indexed) {
    const line = resolved.lines[client.index];
    if (!line) {
      return failure(400, 'A line in this request is not on the saved invoice scan.', 'OCR_LINE_NOT_ON_DRAFT');
    }
    if (!(line.quantity > 0)) {
      skipped.push({
        externalLogId: client.externalLogId,
        itemName: line.line_name?.trim() || 'Line',
        stock: { posted: false, reason: 'Quantity was not read, so this line was not posted.' },
      });
      continue;
    }
    if (!Number.isFinite(line.unit_cost) || line.unit_cost < 0 || line.unit_cost > 1_000_000) {
      return failure(409, 'The saved invoice scan has a cost that cannot be posted.', 'OCR_DRAFT_BLOCKED');
    }
    const packEdit = packEdits.get(client.index);
    const packSize = packEdit?.packSize ?? draftPackSize(line);
    const splitFactor = packEdit?.splitFactor ?? 1;
    if (packEdit?.packSize !== undefined) line.case_pack_size = packEdit.packSize;
    const validated = validateReceivingLogPostInput({
      itemName: line.line_name?.trim() || 'Invoice line',
      productId: line.product_id?.trim() || undefined,
      casesReceived: line.quantity,
      caseCost: line.unit_cost,
      packSize,
      splitFactor,
      retailUnit: client.retailUnit as ReceivingLogPostInput['retailUnit'],
      marginMode: client.marginMode as ReceivingLogPostInput['marginMode'],
      customMarginPercent: client.customMarginPercent,
      currentRetailPrice: client.currentRetailPrice,
      caseRetailPrice: client.caseRetailPrice,
      supplierId: supplierId || client.supplierId,
      ...(line.department_assumed ? { departmentAssumed: true } : line.department ? { department: line.department } : {}),
      ...(client.category ? { category: client.category } : {}),
      ...(client.screenDepartment ? { screenDepartment: client.screenDepartment } : {}),
      externalLogId: client.externalLogId,
    });
    if (!validated.ok) return failure(400, validated.error, 'OCR_LINE_INVALID');
    entries.push({ line: validated.input, draftLineIndex: client.index });
  }

  if (entries.length === 0) {
    return { ok: true, lines: [], results: skipped };
  }

  try {
    const posted = await deps.postLines({
      draft,
      resolved,
      entries,
      actorId: input.actorId,
    });
    return { ok: true, lines: entries.map((entry) => entry.line), results: [...skipped, ...posted] };
  } catch (error) {
    if (error instanceof InventoryLedgerError && error.code === 'DEPARTMENT_REQUIRED') throw error;
    if (error instanceof InventoryLedgerError) {
      const status = error.statusCode === 404 ? 404 : error.statusCode === 409 ? 409 : 400;
      return failure(status, error.message, error.code);
    }
    throw error;
  }
}
