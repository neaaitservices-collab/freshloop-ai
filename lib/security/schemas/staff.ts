import { z } from 'zod';
import { numericInput } from '@/lib/security/numericInput';
import { optionalSafeText, safeText } from '@/lib/security/schemas/common';

const hourlyRateSchema = numericInput(z.number().finite().positive().max(10_000));

export const staffCreateBodySchema = z
  .object({
    name: safeText(120),
    email: z.string().trim().email().max(254),
    position: safeText(120),
    hourlyRate: hourlyRateSchema.optional(),
  })
  .strip();

export const createStaffBodySchema = staffCreateBodySchema;

export const staffUpdateBodySchema = z
  .object({
    name: safeText(120),
    email: z.string().trim().email().max(254),
    position: optionalSafeText(120),
    hourlyRate: z.union([hourlyRateSchema, z.null()]).optional(),
  })
  .strip();
