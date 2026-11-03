import { z } from 'zod';
import { sanitizePlainText } from '@/lib/security/sanitize';

export const productIdSchema = z.string().trim().min(1).max(128);

export const safeText = (maxLen: number) =>
  z
    .string()
    .min(1)
    .max(maxLen * 2)
    .transform((value) => sanitizePlainText(value, maxLen))
    .refine((value) => value.length > 0, { message: 'Value is required.' });

export const optionalSafeText = (maxLen: number) =>
  z
    .string()
    .max(maxLen * 2)
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      const cleaned = sanitizePlainText(value, maxLen);
      return cleaned.length > 0 ? cleaned : undefined;
    });
