import { z } from 'zod';
import { sanitizePlainText } from '@/lib/security/sanitize';
import type { CreditReason } from '@/lib/domains/suppliers/supplierActivityModel';

export type ManualActivityInput =
  | { type: 'NOTE'; note: string }
  | { type: 'LATE_DELIVERY'; invoiceRef: string | null; note: string | null }
  | {
      type: 'SHORT_SHIP' | 'QUALITY_REJECT';
      productId: string | null;
      qty: number | null;
      invoiceRef: string | null;
      note: string | null;
    }
  | {
      type: 'CREDIT';
      amount: number;
      invoiceRef: string;
      reason: CreditReason;
      note: string | null;
    };

function issue(error: z.ZodError): string {
  return error.issues[0]?.message || 'Invalid activity.';
}

function blankToNull(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const copy = { ...(body as Record<string, unknown>) };
  for (const key of ['productId', 'invoiceRef', 'note']) {
    if (copy[key] === '') copy[key] = null;
  }
  return copy;
}

function cleanNote(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = sanitizePlainText(value, 2000);
  return cleaned.length > 0 ? cleaned : null;
}

function cleanRef(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = sanitizePlainText(value, 120);
  return cleaned.length > 0 ? cleaned : null;
}

const noteSchema = z
  .object({
    type: z.literal('NOTE'),
    note: z.string({ required_error: 'Note is required.' }).max(4000),
  })
  .strict();

const lateSchema = z
  .object({
    type: z.literal('LATE_DELIVERY'),
    invoiceRef: z.string().max(240).nullable().optional(),
    note: z.string().max(4000).nullable().optional(),
  })
  .strict();

const alertSchema = z
  .object({
    type: z.enum(['SHORT_SHIP', 'QUALITY_REJECT']),
    productId: z.union([z.string().uuid('Product id is invalid.'), z.null()]).optional(),
    qty: z.number().finite().positive('Quantity must be greater than 0.').max(1_000_000).nullable().optional(),
    invoiceRef: z.string().max(240).nullable().optional(),
    note: z.string().max(4000).nullable().optional(),
  })
  .strict();

const creditSchema = z
  .object({
    type: z.literal('CREDIT'),
    amount: z
      .number({ required_error: 'Amount is required.' })
      .finite()
      .positive('Amount must be greater than 0.')
      .max(1_000_000),
    invoiceRef: z.string({ required_error: 'Invoice reference is required.' }).max(240),
    reason: z.enum(['SHORT', 'DAMAGED', 'QUALITY', 'PRICING', 'OTHER'], {
      required_error: 'Credit reason is required.',
      invalid_type_error: 'Credit reason is invalid.',
    }),
    note: z.string().max(4000).nullable().optional(),
  })
  .strict();

export const receiveCreditSchema = z
  .object({
    creditStatus: z.literal('RECEIVED', { required_error: 'Credit status must be RECEIVED.' }),
  })
  .strict();

export const voidActivitySchema = z
  .object({
    voidReason: z.string({ required_error: 'A void reason is required.' }).max(4000),
  })
  .strict();

export function parseManualActivity(
  body: unknown
): { ok: true; value: ManualActivityInput } | { ok: false; error: string } {
  const normalized = blankToNull(body);
  const type =
    normalized && typeof normalized === 'object' && 'type' in normalized
      ? (normalized as { type?: unknown }).type
      : undefined;
  if (type === 'PRICE_CHANGE') {
    return { ok: false, error: 'Price changes cannot be added by hand.' };
  }
  if (type === 'NOTE') {
    const parsed = noteSchema.safeParse(normalized);
    if (!parsed.success) return { ok: false, error: issue(parsed.error) };
    const note = cleanNote(parsed.data.note);
    if (!note) return { ok: false, error: 'Note is required.' };
    return { ok: true, value: { type: 'NOTE', note } };
  }
  if (type === 'LATE_DELIVERY') {
    const parsed = lateSchema.safeParse(normalized);
    if (!parsed.success) return { ok: false, error: issue(parsed.error) };
    return {
      ok: true,
      value: {
        type: 'LATE_DELIVERY',
        invoiceRef: cleanRef(parsed.data.invoiceRef),
        note: cleanNote(parsed.data.note),
      },
    };
  }
  if (type === 'SHORT_SHIP' || type === 'QUALITY_REJECT') {
    const parsed = alertSchema.safeParse(normalized);
    if (!parsed.success) return { ok: false, error: issue(parsed.error) };
    const productId = typeof parsed.data.productId === 'string' && parsed.data.productId ? parsed.data.productId : null;
    return {
      ok: true,
      value: {
        type,
        productId,
        qty: parsed.data.qty ?? null,
        invoiceRef: cleanRef(parsed.data.invoiceRef),
        note: cleanNote(parsed.data.note),
      },
    };
  }
  if (type === 'CREDIT') {
    const parsed = creditSchema.safeParse(normalized);
    if (!parsed.success) return { ok: false, error: issue(parsed.error) };
    const invoiceRef = cleanRef(parsed.data.invoiceRef);
    if (!invoiceRef) return { ok: false, error: 'Invoice reference is required.' };
    return {
      ok: true,
      value: {
        type: 'CREDIT',
        amount: parsed.data.amount,
        invoiceRef,
        reason: parsed.data.reason,
        note: cleanNote(parsed.data.note),
      },
    };
  }
  return { ok: false, error: 'Activity type is invalid.' };
}

export function parseVoidReason(body: unknown): { ok: true; voidReason: string } | { ok: false; error: string } {
  const parsed = voidActivitySchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: issue(parsed.error) };
  const voidReason = sanitizePlainText(parsed.data.voidReason, 500);
  if (!voidReason) return { ok: false, error: 'A void reason is required.' };
  return { ok: true, voidReason };
}
