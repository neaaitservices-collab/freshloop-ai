import { NextRequest, NextResponse } from 'next/server';
import { registerStaffUser } from '@/lib/auth/registerStaff';
import { apiError, apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { signupBodySchema } from '@/lib/security/schemas/auth';
import { assertMutationRateLimit, clientIpKey } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const limited = assertMutationRateLimit(clientIpKey(req), 'auth-signup', 8, 15 * 60_000);
    if (limited) return limited;

    const body = await parseJsonBody(req, signupBodySchema);

    const user = await registerStaffUser({
      name: body.name,
      email: body.email,
      password: body.password,
      role: body.role,
      position: body.position,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        position: user.position,
        role: user.role,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Unique constraint') || message.includes('already in use')) {
      return apiError('That email is already registered. Sign in instead.', 409);
    }
    if (message.includes('Registration is closed')) {
      return apiError(message, 403);
    }
    if (message.includes('Password must') || message.includes('required')) {
      return apiError(message, 400);
    }
    return apiErrorFromUnknown(error, 'Could not create account.');
  }
}
