import { NextRequest, NextResponse } from 'next/server';
import { createPasswordResetToken, passwordResetUrl } from '@/lib/auth/passwordReset';
import { sendStaffEmail } from '@/lib/auth/sendStaffEmail';
import { apiError, apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { forgotPasswordBodySchema } from '@/lib/security/schemas/auth';
import { assertMutationRateLimit, clientIpKey } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

const GENERIC_OK =
  'If that email is registered, we sent a link to reset your password. Check your inbox.';

export async function POST(req: NextRequest) {
  try {
    const limited = assertMutationRateLimit(clientIpKey(req), 'auth-forgot-password', 6, 15 * 60_000);
    if (limited) return limited;

    const body = await parseJsonBody(req, forgotPasswordBodySchema);
    const email = body.email.trim().toLowerCase();

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
    return apiErrorFromUnknown(error, 'Could not send reset email.');
  }
}
