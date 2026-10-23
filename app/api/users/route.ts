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

export async function GET() {
  try {
    const users = await prisma.user.findMany({ orderBy: [{ role: 'asc' }, { name: 'asc' }] });
    return NextResponse.json({ success: true, users: users.map(toStaffUser) });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Staff could not be loaded.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
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
    if (!name || !email || !position) {
      return NextResponse.json(
        { success: false, error: 'Name, email, and position are required.' },
        { status: 400 }
      );
    }
    if (!isRoleName(role)) {
      return NextResponse.json({ success: false, error: 'Choose a valid role.' }, { status: 400 });
    }
    const user = await prisma.user.create({
      data: { name, email, position, role },
    });
    return NextResponse.json({ success: true, user: toStaffUser(user) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Staff could not be added.';
    const status = message.includes('Unique constraint') ? 409 : 500;
    return NextResponse.json(
      { success: false, error: status === 409 ? 'That email is already in use.' : message },
      { status }
    );
  }
}
