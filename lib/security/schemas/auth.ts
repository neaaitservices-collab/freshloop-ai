import { z } from 'zod';
import { optionalSafeText, safeText } from '@/lib/security/schemas/common';

export const signupBodySchema = z
  .object({
    name: safeText(120),
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(128),
    /** Accepted and discarded. Public signup never stores a client-chosen role. */
    role: z.unknown().optional(),
    /** Legacy free-text title. Public signup does not grant access from this field. */
    position: optionalSafeText(120),
  })
  .strict()
  .transform(({ role: _role, ...rest }) => rest);

export const forgotPasswordBodySchema = z
  .object({
    email: z.string().trim().email().max(254),
  })
  .strict();

export const resetPasswordBodySchema = z
  .object({
    email: z.string().trim().email().max(254),
    token: z.string().trim().min(16).max(512),
    password: z.string().min(8).max(128),
  })
  .strict();
