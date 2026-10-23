import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { isRoleName, type StaffUser } from '@/lib/utils/roles';

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
    const { id } = await context.params;
    const body = (await req.json()) as {
      name?: string;
      email?: string;
      position?: string;
      role?: string;
    };
    const name = body.name?.trim() ?? '';
    const email = body.email?.trim().toLowerCase() ?? '';
    const position = body.position?.trim() ?? '';
    const role = body.role ?? '';
    if (!name || !email || !position || !isRoleName(role)) {
      return NextResponse.json(
        { success: false, error: 'Name, email, position, and role are required.' },
        { status: 400 }
      );
    }
    if (role !== 'ADMIN') {
      const admins = await prisma.user.count({ where: { role: 'ADMIN', NOT: { id } } });
      const current = await prisma.user.findUnique({ where: { id } });
      if (current?.role === 'ADMIN' && admins === 0) {
        return NextResponse.json(
          { success: false, error: 'Keep at least one admin.' },
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
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Staff could not be removed.' },
      { status: 500 }
    );
  }
}
