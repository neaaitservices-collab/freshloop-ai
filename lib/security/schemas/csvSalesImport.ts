import { z } from 'zod';
import { optionalSafeText, safeText } from '@/lib/security/schemas/common';

const headerName = safeText(80);

const optionalHeader = z
  .string()
  .max(160)
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    const cleaned = value.trim();
    return cleaned.length > 0 ? cleaned.slice(0, 80) : undefined;
  });

export const csvColumnMappingSchema = z
  .object({
    sku: headerName,
    qty: headerName,
    unit: headerName,
    revenue: headerName,
    date: headerName,
    externalRef: optionalHeader,
    itemName: optionalHeader,
    variation: optionalHeader,
    grossSales: optionalHeader,
  })
  .strict()
  .superRefine((mapping, ctx) => {
    const names = [
      mapping.sku,
      mapping.qty,
      mapping.unit,
      mapping.revenue,
      mapping.date,
      mapping.externalRef,
      mapping.itemName,
      mapping.variation,
      mapping.grossSales,
    ].filter((name): name is string => Boolean(name));
    const seen = new Set<string>();
    for (const name of names) {
      const key = name.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each column can only be mapped once.',
          path: ['sku'],
        });
        return;
      }
      seen.add(key);
    }
  });

export type CsvColumnMapping = z.output<typeof csvColumnMappingSchema>;

/** A parsed row that is allowed to post. Bad rows never reach this schema. */
export const csvImportRowSchema = z
  .object({
    sku: z.string().trim().min(1).max(128),
    qty: z.number().finite().positive().max(1_000_000),
    unit: z.string().trim().min(1).max(32),
    revenue: z.number().finite().min(0).max(1_000_000),
    soldAt: z.date(),
    externalRef: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export const CSV_SALES_MAX_BYTES = 1_000_000;
export const CSV_SALES_MAX_ROWS = 2_000;

export const csvSalesImportBodySchema = z
  .object({
    csv: z.string().min(1, 'Choose a CSV file.').max(CSV_SALES_MAX_BYTES),
    mapping: csvColumnMappingSchema,
    storeId: optionalSafeText(128),
  })
  .strict();

export const csvSalesMappingBodySchema = z
  .object({
    mapping: csvColumnMappingSchema,
    storeId: optionalSafeText(128),
  })
  .strict();
