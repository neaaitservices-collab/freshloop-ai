import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { isLedgerIdempotencyConflict } from '@/lib/domains/inventory/idempotencyConflict';
import {
  applyOcrDraftResolutions,
  draftPostingBlockers,
  draftResolutionFingerprint,
  type OcrDraftResolution,
} from '@/lib/domains/receiving/invoiceOcrDraft';
import {
  ReceiptIdentityConflict,
  writeInvoiceReceipts,
  type OcrDraftPayload,
} from '@/lib/domains/receiving/invoiceOcrCommit';
import { sampleInvoiceCommitRejection } from '@/lib/domains/receiving/sampleReceivingGuard';

export class DraftCommitConflict extends Error {
  readonly status = 409;
  readonly result: unknown;
  constructor(message: string, result: unknown = null) {
    super(message);
    this.name = 'DraftCommitConflict';
    this.result = result;
  }
}

export function draftCommitKey(draftId: string): string {
  return `invoice-draft:${draftId}`;
}

type LockedDraft = {
  id: string;
  payload: OcrDraftPayload;
  result: unknown;
  expires_at: Date;
  consumed_at: Date | null;
};

export interface SettleDraftInput {
  draftId: string;
  staffId: string;
  actorIsManager: boolean;
  manualReviewOverride: boolean;
  resolutions?: OcrDraftResolution;
  /** When false, save corrections under the row lock and do not post stock. */
  post: boolean;
}

export type SettleDraftOutcome =
  | { kind: 'missing' }
  | { kind: 'expired' }
  | { kind: 'sample'; error: string }
  | { kind: 'blocked'; blockers: string[]; payload: OcrDraftPayload }
  | { kind: 'replay'; result: unknown; payload: OcrDraftPayload }
  | { kind: 'conflict'; error: string; result: unknown }
  | {
      kind: 'posted';
      payload: OcrDraftPayload;
      result: { invoiceId: string | null; transactionsCreated: number; receipts: unknown[] };
    };

/**
 * Claim one OCR draft inside the same transaction as any stock post.
 * Two resolutions of this draft cannot both receive inventory.
 */
export async function settleStoredOcrDraft(input: SettleDraftInput): Promise<SettleDraftOutcome> {
  try {
    const outcome = await prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<LockedDraft[]>`
          SELECT id, payload, result, expires_at, consumed_at
          FROM invoice_ocr_drafts
          WHERE id = ${input.draftId}
          FOR UPDATE
        `;
        const row = rows[0];
        if (!row) return { kind: 'missing' } as const;
        if (new Date(row.expires_at).getTime() < Date.now()) return { kind: 'expired' } as const;

        const stored = row.payload as OcrDraftPayload;
        const candidate = input.resolutions
          ? applyOcrDraftResolutions(stored, input.resolutions, {
              actorIsManager: input.actorIsManager,
              manualReviewOverride: input.manualReviewOverride,
            })
          : stored;

        if (row.consumed_at) {
          if (draftResolutionFingerprint(candidate) === draftResolutionFingerprint(stored)) {
            return { kind: 'replay', result: row.result, payload: stored } as const;
          }
          return {
            kind: 'conflict',
            error:
              'This scan was already received with a different vendor, invoice number, or line facts.',
            result: row.result,
          } as const;
        }

        const sampleReason = sampleInvoiceCommitRejection({
          invoiceNumber: candidate.invoiceNumber,
        });
        if (sampleReason) return { kind: 'sample', error: sampleReason } as const;

        const blockers = draftPostingBlockers(candidate, {
          actorIsManager: input.actorIsManager,
          manualReviewOverride: input.manualReviewOverride,
        });
        if (!input.post || blockers.length > 0) {
          await tx.invoiceOcrDraft.update({
            where: { id: row.id },
            data: { payload: candidate as unknown as Prisma.InputJsonValue },
          });
          return { kind: 'blocked', blockers, payload: candidate } as const;
        }

        await tx.ledgerIdempotencyKey.create({ data: { key: draftCommitKey(row.id) } });
        const committed = await writeInvoiceReceipts(tx, {
          staffId: input.staffId,
          referenceId: draftCommitKey(row.id),
          confirmedItems: candidate.lines.map((line) => ({
            product_id: line.product_id,
            quantity: line.quantity,
            quantity_kind: line.quantity_kind,
            unit_cost: line.unit_cost,
            line_name: line.line_name,
            department: line.department,
            case_pack_size: line.case_pack_size,
            line_confidence: line.line_confidence,
            delivery_id: line.delivery_id,
          })),
          invoiceMeta: {
            vendorName: candidate.vendorName,
            invoiceNumber: candidate.invoiceNumber,
            invoiceDate: candidate.invoiceDate,
            totalAmount: candidate.totalAmount,
            departmentBreakdown: candidate.departmentBreakdown,
          },
          supplierName: candidate.vendorName,
        });
        await tx.invoiceOcrDraft.update({
          where: { id: row.id },
          data: {
            payload: candidate as unknown as Prisma.InputJsonValue,
            consumedAt: new Date(),
            result: committed as unknown as Prisma.InputJsonValue,
          },
        });
        return { kind: 'posted', payload: candidate, result: committed } as const;
      },
      { timeout: 20_000 }
    );
    return outcome;
  } catch (error) {
    if (error instanceof ReceiptIdentityConflict) {
      return { kind: 'conflict', error: error.message, result: null };
    }
    if (isLedgerIdempotencyConflict(error)) {
      const current = await prisma.invoiceOcrDraft.findUnique({
        where: { id: input.draftId },
        select: { result: true, payload: true },
      });
      return {
        kind: 'conflict',
        error: 'This scan was already received.',
        result: current?.result ?? null,
      };
    }
    throw error;
  }
}
