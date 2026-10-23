import { NextRequest, NextResponse } from 'next/server';
import { registerStaffUser } from '@/lib/auth/registerStaff';
import { apiError } from '@/lib/domains/ai/apiError';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      name?: string;
      email?: string;
      password?: string;
      position?: string;
    };

    const user = await registerStaffUser({
      name: body.name ?? '',
      email: body.email ?? '',
      password: body.password ?? '',
      position: body.position ?? '',
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
    const message = error instanceof Error ? error.message : 'Could not create account.';
    if (message.includes('Unique constraint') || message.includes('already in use')) {
      return apiError('That email is already registered. Sign in instead.', 409);
    }
    if (message.includes('Registration is closed')) {
      return apiError(message, 403);
    }
    if (message.includes('Password must') || message.includes('required')) {
      return apiError(message, 400);
    }
    return apiError(message, 500);
  }
}
