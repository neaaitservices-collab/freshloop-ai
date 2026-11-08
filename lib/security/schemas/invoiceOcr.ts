import { z } from 'zod';

export const invoiceOcrCommitBodySchema = z
  .object({
    confirmCommit: z.literal(true),
    /** Server scan id. Quantities and costs come from that draft, not this body. */
    draftId: z.string().trim().min(1).max(128),
    manualReviewOverride: z.boolean().optional(),
  })
  .strict();

export type InvoiceOcrCommitBody = z.infer<typeof invoiceOcrCommitBodySchema>;
