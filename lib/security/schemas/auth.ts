import { z } from 'zod';
import { optionalSafeText, safeText } from '@/lib/security/schemas/common';

/** Roles allowed on public self-signup (never ADMIN or STORE_MANAGER). */
export const PUBLIC_SIGNUP_ROLES = ['FLOOR_STAFF', 'RECEIVING_CLERK', 'DELI_CHEF'] as const;

const signupRoleSchema = z.enum(PUBLIC_SIGNUP_ROLES);

export const signupBodySchema = z
  .object({
    name: safeText(120),
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(128),
    /** Platform role — must match a catalog position on signup. */
    role: signupRoleSchema,
    /** Legacy free-text title; ignored when role is set (position label is derived from role). */
    position: optionalSafeText(120),
  })
  .strict();

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
