import { Department } from '@prisma/client';
import { z } from 'zod';

export const invoiceOcrCommitBodySchema = z
  .object({
    confirmCommit: z.literal(true),
    /** Server scan id. Quantities and costs come from that draft, not this body. */
    draftId: z.string().trim().min(1).max(128),
    manualReviewOverride: z.boolean().optional(),
    /** Fills stored gaps. Does not clear confidence or cost review by itself. */
    resolutions: z
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
      .strict()
      .optional(),
  })
  .strict();

export type InvoiceOcrCommitBody = z.infer<typeof invoiceOcrCommitBodySchema>;
