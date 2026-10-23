import { AuthError } from '@/lib/auth/session';
import { apiError } from '@/lib/domains/ai/apiError';

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return apiError(error.message, error.status);
  }
  return null;
}
