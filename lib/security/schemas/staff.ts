import { z } from 'zod';
import { optionalSafeText, safeText } from '@/lib/security/schemas/common';

export const staffCreateBodySchema = z
  .object({
    name: safeText(120),
    email: z.string().trim().email().max(254),
    position: safeText(120),
    hourlyRate: z.coerce.number().finite().positive().max(10_000).optional(),
  })
  .strip();

export const staffUpdateBodySchema = z
  .object({
    name: safeText(120),
    email: z.string().trim().email().max(254),
    position: optionalSafeText(120),
    hourlyRate: z.union([z.coerce.number().finite().positive().max(10_000), z.null()]).optional(),
  })
  .strip();
