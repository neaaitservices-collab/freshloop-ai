import { Department } from '@prisma/client';
import { z } from 'zod';
import { INVOICE_PDF_MAX_PAGES } from '@/lib/domains/ai/invoiceScan';
import { numericInput } from '@/lib/security/numericInput';

export const invoiceOcrResolutionsSchema = z
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
          })
          .strict()
      )
      .max(500)
      .optional(),
  })
  .strict();

export const invoiceOcrResolveBodySchema = z
  .object({
    resolveDraft: z.literal(true),
    draftId: z.string().trim().min(1).max(128),
    manualReviewOverride: z.boolean().optional(),
    resolutions: invoiceOcrResolutionsSchema,
  })
  .strict();

export const invoiceOcrCommitBodySchema = z
  .object({
    confirmCommit: z.literal(true),
    /** Server scan id. Quantities and costs come from that draft, not this body. */
    draftId: z.string().trim().min(1).max(128),
    supplierId: z
      .string()
      .trim()
      .min(1, 'Select a saved supplier before this invoice can be received.'),
    manualReviewOverride: z.boolean().optional(),
    /** Fills stored gaps. A clerk cannot clear an assumed department with this. */
    resolutions: invoiceOcrResolutionsSchema.optional(),
  })
  .strict();

export type InvoiceOcrCommitBody = z.infer<typeof invoiceOcrCommitBodySchema>;

const invoicePageImageSchema = z
  .object({
    index: numericInput(z.number().int().min(1).max(INVOICE_PDF_MAX_PAGES)),
    imageBase64: z.string().trim().min(1),
    mimeType: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export const invoicePageScanBodySchema = z
  .object({
    clientScanId: z.string().uuid(),
    pageCount: numericInput(z.number().int().min(1).max(INVOICE_PDF_MAX_PAGES)),
    pages: z.array(invoicePageImageSchema).min(1).max(INVOICE_PDF_MAX_PAGES),
  })
  .strict()
  .superRefine((body, ctx) => {
    const seen = new Set<number>();
    for (const page of body.pages) {
      if (page.index > body.pageCount) {
        ctx.addIssue({ code: 'custom', message: 'Page index is outside this invoice.', path: ['pages'] });
      }
      if (seen.has(page.index)) {
        ctx.addIssue({ code: 'custom', message: 'Each page index can be sent once.', path: ['pages'] });
      }
      seen.add(page.index);
    }
  });

export const invoicePageRetryBodySchema = z
  .object({
    retryPage: z.literal(true),
    draftId: z.string().trim().min(1).max(128),
    page: invoicePageImageSchema,
  })
  .strict();

export const invoicePageUndoBodySchema = z
  .object({
    undoDedupe: z.literal(true),
    draftId: z.string().trim().min(1).max(128),
  })
  .strict();

export type InvoicePageScanBody = z.infer<typeof invoicePageScanBodySchema>;
export type InvoicePageRetryBody = z.infer<typeof invoicePageRetryBodySchema>;
