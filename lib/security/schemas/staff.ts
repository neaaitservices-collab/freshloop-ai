import { z } from 'zod';
import { numericInput } from '@/lib/security/numericInput';
import { optionalSafeText, safeText } from '@/lib/security/schemas/common';
import { ROLES } from '@/lib/utils/roles';

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

export const staffRoleSchema = z.enum(ROLES);

export const staffUpdateBodySchema = z
  .object({
    name: safeText(120),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    position: optionalSafeText(120),
    hourlyRate: z.union([hourlyRateSchema, z.null()]).optional(),
    role: staffRoleSchema.optional(),
    currentPassword: z.string().max(200).optional(),
  })
  .strict();

export const staffReactivateBodySchema = z
  .object({
    reactivate: z.literal(true),
  })
  .strict();
