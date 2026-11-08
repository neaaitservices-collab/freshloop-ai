import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { handleApiRouteError } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { verifyPassword } from '@/lib/auth/password';
import { AuthError, requireRoles, requireSessionUser } from '@/lib/auth/session';
import { z } from 'zod';
import { MANAGER_ROLES } from '@/lib/auth/permissions';
import { getStaffHourlyRate, setStaffHourlyRate } from '@/lib/auth/staffHourlyRate';
import { invalidateReferenceDataCaches } from '@/lib/domains/inventory/inventoryCache';
import { positionByLabel } from '@/lib/utils/positions';
import { isManager, isRoleName, type StaffUser } from '@/lib/utils/roles';

export const dynamic = 'force-dynamic';

const staffCoreSelect = {
  id: true,
  name: true,
  email: true,
  position: true,
  role: true,
} as const;

function toStaffUser(
  user: {
    id: string;
    name: string;
    email: string;
    position: string;
    role: Role;
  },
  hourlyRate: number | null
): StaffUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    position: user.position,
    role: user.role,
    hourlyRate,
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
      hourlyRate?: number | null;
      currentPassword?: string;
    };
    const name = body.name?.trim() ?? '';
    const emailParsed = z.string().trim().email().max(254).safeParse(body.email ?? '');
    const email = emailParsed.success ? emailParsed.data.toLowerCase() : '';
    if (!name || !emailParsed.success) {
      return NextResponse.json(
        { success: false, error: 'Name and a valid email are required.' },
        { status: 400 }
      );
    }

    const current = await prisma.user.findUnique({
      where: { id },
      select: staffCoreSelect,
    });
    if (!current || !isRoleName(current.role)) {
      return NextResponse.json(
        { success: false, error: 'That person is already gone.' },
        { status: 404 }
      );
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

    let hourlyRateUpdate: number | null | undefined;
    if (body.hourlyRate !== undefined) {
      if (!isManager(actor.role)) {
        return NextResponse.json(
          { success: false, error: 'Only a manager can change hourly wage.' },
          { status: 403 }
        );
      }
      if (body.hourlyRate === null) {
        hourlyRateUpdate = null;
      } else {
        const parsed = Number(body.hourlyRate);
        if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10_000) {
          return NextResponse.json(
            { success: false, error: 'Hourly wage must be a positive number.' },
            { status: 400 }
          );
        }
        hourlyRateUpdate = Number(parsed.toFixed(2));
      }
    }

    const emailChanged = email !== current.email;
    if (emailChanged && isSelf) {
      const supplied = typeof body.currentPassword === 'string' ? body.currentPassword : '';
      const secret = await prisma.user.findUnique({
        where: { id },
        select: { passwordHash: true },
      });
      const matches =
        Boolean(secret?.passwordHash) &&
        (await verifyPassword(supplied, secret?.passwordHash ?? ''));
      if (!matches) {
        return NextResponse.json(
          { success: false, error: 'Current password is required to change your email.' },
          { status: 403 }
        );
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        name,
        email,
        position,
        role,
        ...(emailChanged ? { credentialVersion: { increment: 1 } } : {}),
      },
      select: staffCoreSelect,
    });

    const finalHourlyRate =
      hourlyRateUpdate !== undefined
        ? await setStaffHourlyRate(id, hourlyRateUpdate)
        : await getStaffHourlyRate(id);

    invalidateReferenceDataCaches();
    return NextResponse.json({
      success: true,
      user: toStaffUser(user, finalHourlyRate),
    });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return handleApiRouteError('PATCH /api/users/[id]', error, 'Staff could not be updated.');
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRoles(MANAGER_ROLES);
    const { id } = await context.params;
    const current = await prisma.user.findUnique({
      where: { id },
      select: staffCoreSelect,
    });
    if (!current) {
      return NextResponse.json(
        { success: false, error: 'That person is already gone.' },
        { status: 404 }
      );
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
    invalidateReferenceDataCaches();
    return NextResponse.json({ success: true });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return handleApiRouteError('DELETE /api/users/[id]', error, 'Staff could not be removed.');
  }
}
