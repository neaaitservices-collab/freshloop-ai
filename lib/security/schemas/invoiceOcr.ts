import { Department, InventoryLocation } from '@prisma/client';
import { z } from 'zod';
import { productIdSchema } from '@/lib/security/schemas/common';

const ocrCommitLineSchema = z
  .object({
    product_id: productIdSchema,
    quantity: z.number().finite().positive().max(1_000_000),
    quantity_kind: z.enum(['units', 'cases']).optional(),
    unit_cost: z.number().finite().min(0).max(1_000_000),
    to_location: z.nativeEnum(InventoryLocation).optional(),
    line_name: z.string().trim().max(256).optional(),
    department: z.nativeEnum(Department).optional(),
    case_pack_size: z.number().finite().positive().max(1_000_000).optional(),
    extraction_confidence: z.number().min(0).max(1).optional(),
    match_confidence: z.number().min(0).max(1).optional(),
    line_confidence: z.number().min(0).max(1).optional(),
    needs_manual_review: z.boolean().optional(),
  })
  .strict();

export const invoiceOcrCommitBodySchema = z
  .object({
    confirmCommit: z.literal(true),
    confirmedItems: z.array(ocrCommitLineSchema).min(1).max(500),
    invoiceNumber: z.string().trim().min(1).max(128).optional(),
    manualReviewOverride: z.boolean().optional(),
    invoiceMeta: z
      .object({
        vendorName: z.string().trim().min(1).max(256),
        supplierId: z.string().trim().max(128).optional().nullable(),
        invoiceNumber: z.string().trim().min(1).max(128),
        invoiceDate: z.string().trim().min(1).max(32),
        totalAmount: z.number().finite().min(0),
        departmentBreakdown: z.record(z.string(), z.number().finite().min(0)),
        rawOcrJson: z.unknown().optional(),
      })
      .strict()
      .optional()
      .nullable(),
  })
  .strict();

export type InvoiceOcrCommitBody = z.infer<typeof invoiceOcrCommitBodySchema>;
