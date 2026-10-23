import { NextRequest, NextResponse } from 'next/server';
import { createPasswordResetToken, passwordResetUrl } from '@/lib/auth/passwordReset';
import { sendStaffEmail } from '@/lib/auth/sendStaffEmail';
import { apiError } from '@/lib/domains/ai/apiError';

export const dynamic = 'force-dynamic';

const GENERIC_OK =
  'If that email is registered, we sent a link to reset your password. Check your inbox.';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase() ?? '';
    if (!email || !email.includes('@')) {
      return apiError('Enter a valid work email.', 400);
    }

    const token = await createPasswordResetToken(email);
    if (!token) {
      return NextResponse.json({
        success: true,
        message: GENERIC_OK,
        ...(process.env.NODE_ENV === 'development'
          ? {
              devHint:
                'No staff account uses that email yet. Sign up at /signup or use a seeded @freshloop.test address.',
            }
          : {}),
      });
    }

    const link = passwordResetUrl(email, token);
    const emailResult = await sendStaffEmail({
      to: email,
      subject: 'Reset your FreshLoop password',
      text: [
        'You asked to reset your FreshLoop staff password.',
        '',
        `Open this link within 1 hour:`,
        link,
        '',
        'If you did not request this, ignore this email.',
      ].join('\n'),
      html: `<p>You asked to reset your FreshLoop staff password.</p><p><a href="${link}">Reset password</a></p><p>This link expires in 1 hour.</p>`,
    });

    return NextResponse.json({
      success: true,
      message: emailResult.devLogged
        ? 'Email is not configured (no RESEND_API_KEY). Use the reset link below — it was not sent to your inbox.'
        : GENERIC_OK,
      ...(process.env.NODE_ENV === 'development' && emailResult.devLogged
        ? { devResetLink: link }
        : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not send reset email.';
    return apiError(message, 500);
  }
}
