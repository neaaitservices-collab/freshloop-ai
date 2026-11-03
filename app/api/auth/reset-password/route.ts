import { NextRequest, NextResponse } from 'next/server';
import { resetPasswordWithToken } from '@/lib/auth/passwordReset';
import { apiError, apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { resetPasswordBodySchema } from '@/lib/security/schemas/auth';
import { assertMutationRateLimit, clientIpKey } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const limited = assertMutationRateLimit(clientIpKey(req), 'auth-reset-password', 10, 15 * 60_000);
    if (limited) return limited;

    const body = await parseJsonBody(req, resetPasswordBodySchema);
    const email = body.email.trim().toLowerCase();
    const token = body.token.trim();
    const password = body.password;

    const ok = await resetPasswordWithToken({ email, token, newPassword: password });
    if (!ok) {
      return apiError('This reset link expired or is invalid. Request a new one.', 400);
    }

    return NextResponse.json({
      success: true,
      message: 'Password updated. You can sign in now.',
    });
  } catch (error) {
    return apiErrorFromUnknown(error, 'Could not reset password.');
  }
}
