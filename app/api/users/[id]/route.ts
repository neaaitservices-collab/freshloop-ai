import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { authErrorResponse } from '@/lib/auth/http';
import { AuthError, requireRoles, requireSessionUser } from '@/lib/auth/session';
import { MANAGER_ROLES } from '@/lib/auth/permissions';
import { positionByLabel } from '@/lib/utils/positions';
import { isManager, isRoleName, type StaffUser } from '@/lib/utils/roles';

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

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireSessionUser();
    const { id } = await context.params;
    const isSelf = actor.id === id;
    if (!isSelf && !isManager(actor.role)) {
      throw new AuthError('Forbidden — managers only.', 403);
    }
    const body = (await req.json()) as {
      name?: string;
      email?: string;
      position?: string;
    };
    const name = body.name?.trim() ?? '';
    const email = body.email?.trim().toLowerCase() ?? '';
    if (!name || !email) {
      return NextResponse.json(
        { success: false, error: 'Name and email are required.' },
        { status: 400 }
      );
    }

    const current = await prisma.user.findUnique({ where: { id } });
    if (!current || !isRoleName(current.role)) {
      return NextResponse.json({ success: false, error: 'That person is already gone.' }, { status: 404 });
    }

    let position = current.position;
    let role = current.role;
    if (typeof body.position === 'string' && body.position.trim()) {
      if (!isManager(actor.role)) {
        return NextResponse.json(
          { success: false, error: 'Only a manager can change a position.' },
          { status: 403 }
        );
      }
      const assigned = positionByLabel(body.position);
      if (!assigned) {
        return NextResponse.json(
          { success: false, error: 'Choose a position. Permissions follow that position.' },
          { status: 400 }
        );
      }
      position = assigned.label;
      role = assigned.role;
    }

    if (role !== 'ADMIN' && current.role === 'ADMIN') {
      const admins = await prisma.user.count({ where: { role: 'ADMIN', NOT: { id } } });
      if (admins === 0) {
        return NextResponse.json(
          { success: false, error: 'Keep at least one owner.' },
          { status: 400 }
        );
      }
    }
    const user = await prisma.user.update({
      where: { id },
      data: { name, email, position, role },
    });
    return NextResponse.json({ success: true, user: toStaffUser(user) });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : 'Staff could not be updated.';
    const status = message.includes('Unique constraint') ? 409 : 500;
    return NextResponse.json(
      { success: false, error: status === 409 ? 'That email is already in use.' : message },
      { status }
    );
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRoles(MANAGER_ROLES);
    const { id } = await context.params;
    const current = await prisma.user.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json({ success: false, error: 'That person is already gone.' }, { status: 404 });
    }
    if (current.role === 'ADMIN') {
      const admins = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (admins <= 1) {
        return NextResponse.json(
          { success: false, error: 'Keep at least one admin.' },
          { status: 400 }
        );
      }
    }
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Staff could not be removed.' },
      { status: 500 }
    );
  }
}
