import { NextRequest, NextResponse } from 'next/server';
import { resetPasswordWithToken } from '@/lib/auth/passwordReset';
import { apiError } from '@/lib/domains/ai/apiError';

export const dynamic = 'force-dynamic';

const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email?: string;
      token?: string;
      password?: string;
    };
    const email = body.email?.trim().toLowerCase() ?? '';
    const token = body.token?.trim() ?? '';
    const password = body.password ?? '';

    if (!email || !token) {
      return apiError('Reset link is invalid or incomplete.', 400);
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return apiError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, 400);
    }

    const ok = await resetPasswordWithToken({ email, token, newPassword: password });
    if (!ok) {
      return apiError('This reset link expired or is invalid. Request a new one.', 400);
    }

    return NextResponse.json({
      success: true,
      message: 'Password updated. You can sign in now.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not reset password.';
    return apiError(message, 500);
  }
}
