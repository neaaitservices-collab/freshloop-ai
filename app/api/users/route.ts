import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { authErrorResponse } from '@/lib/auth/http';
import { requireRoles, requireSessionUser } from '@/lib/auth/session';
import { MANAGER_ROLES } from '@/lib/auth/permissions';
import { positionByLabel } from '@/lib/utils/positions';
import type { StaffUser } from '@/lib/utils/roles';

export const dynamic = 'force-dynamic';

function toStaffUser(user: {
  id: string;
  name: string;
  email: string;
  position: string;
  role: Role;
}): StaffUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    position: user.position,
    role: user.role,
  };
}

export async function GET() {
  try {
    const sessionUser = await requireSessionUser();
    if (!MANAGER_ROLES.includes(sessionUser.role)) {
      return NextResponse.json({ success: true, users: [sessionUser] });
    }
    const users = await prisma.user.findMany({ orderBy: [{ role: 'asc' }, { name: 'asc' }] });
    return NextResponse.json({ success: true, users: users.map(toStaffUser) });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Staff could not be loaded.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRoles(MANAGER_ROLES);
    const body = (await req.json()) as {
      name?: string;
      email?: string;
      position?: string;
      role?: string;
    };
    const name = body.name?.trim() ?? '';
    const email = body.email?.trim().toLowerCase() ?? '';
    const assigned = positionByLabel(body.position ?? '');
    if (!name || !email || !assigned) {
      return NextResponse.json(
        { success: false, error: 'Name, email, and a position are required. Permissions follow that position.' },
        { status: 400 }
      );
    }
    const user = await prisma.user.create({
      data: { name, email, position: assigned.label, role: assigned.role },
    });
    return NextResponse.json({ success: true, user: toStaffUser(user) });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : 'Staff could not be added.';
    const status = message.includes('Unique constraint') ? 409 : 500;
    return NextResponse.json(
      { success: false, error: status === 409 ? 'That email is already in use.' : message },
      { status }
    );
  }
}
