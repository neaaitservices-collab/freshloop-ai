import { NextRequest, NextResponse } from 'next/server';
import { handleApiRouteError } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { verifyPassword } from '@/lib/auth/password';
import { requireAdminStaff, requireStaffEditor } from '@/lib/auth/guardRoute';
import { AuthError } from '@/lib/auth/session';
import {
  assertMayEditStaff,
  deactivateStaff,
  reactivateStaff,
  saveStaffProfile,
  StaffAccountError,
  type StaffRecord,
} from '@/lib/auth/staffAccount';
import { getStaffAccountDb } from '@/lib/auth/staffAccountStore';
import { invalidateReferenceDataCaches } from '@/lib/domains/inventory/inventoryCache';
import { getStaffHourlyRate, setStaffHourlyRate } from '@/lib/auth/staffHourlyRate';
import { InvalidJsonBodyError } from '@/lib/security/parseJsonBody';
import { staffReactivateBodySchema, staffUpdateBodySchema } from '@/lib/security/schemas/staff';
import { isManager, isRoleName, type StaffUser } from '@/lib/utils/roles';

export const dynamic = 'force-dynamic';

function staffErrorResponse(error: unknown) {
  if (error instanceof StaffAccountError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  return authErrorResponse(error);
}

function toStaffUser(user: StaffRecord, hourlyRate: number | null): StaffUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    position: user.position,
    role: user.role,
    hourlyRate,
    deactivatedAt: user.deactivatedAt ? user.deactivatedAt.toISOString() : null,
  };
}

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new InvalidJsonBodyError();
  }
}

function bodyHasRole(raw: unknown): boolean {
  return Boolean(raw) && typeof raw === 'object' && raw !== null && 'role' in raw;
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const raw = await readJson(req);
    if (staffReactivateBodySchema.safeParse(raw).success) {
      const actor = await requireAdminStaff();
      const user = await reactivateStaff(getStaffAccountDb(), actor, id);
      const hourlyRate = await getStaffHourlyRate(id);
      invalidateReferenceDataCaches();
      return NextResponse.json({ success: true, user: toStaffUser(user, hourlyRate) });
    }

    const actor = bodyHasRole(raw) ? await requireAdminStaff() : await requireStaffEditor();
    const body = staffUpdateBodySchema.parse(raw);
    const isSelf = actor.id === id;
    if (!isSelf && !isManager(actor.role)) {
      throw new AuthError('Forbidden — managers only.', 403);
    }

    const current = await getStaffAccountDb().findById(id);
    if (!current || !isRoleName(current.role)) {
      return NextResponse.json(
        { success: false, error: 'That person is already gone.' },
        { status: 404 }
      );
    }

    if (typeof body.position === 'string' && body.position.trim() && !isManager(actor.role)) {
      return NextResponse.json(
        { success: false, error: 'Only a manager can change a position.' },
        { status: 403 }
      );
    }

    assertMayEditStaff(actor, current);

    const emailChanged = body.email !== current.email;
    if (emailChanged && isSelf) {
      const supplied = body.currentPassword ?? '';
      const secret = await getStaffAccountDb().passwordHashFor(id);
      const matches = Boolean(secret) && (await verifyPassword(supplied, secret ?? ''));
      if (!matches) {
        return NextResponse.json(
          { success: false, error: 'Current password is required to change your email.' },
          { status: 403 }
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
      hourlyRateUpdate = body.hourlyRate;
    }

    const saved = await saveStaffProfile(getStaffAccountDb(), actor, id, {
      name: body.name,
      email: body.email,
      position: body.position,
      role: body.role,
    });

    const finalHourlyRate =
      hourlyRateUpdate !== undefined
        ? await setStaffHourlyRate(id, hourlyRateUpdate)
        : await getStaffHourlyRate(id);

    invalidateReferenceDataCaches();
    return NextResponse.json({
      success: true,
      user: toStaffUser(saved, finalHourlyRate),
    });
  } catch (error) {
    const staffRes = staffErrorResponse(error);
    if (staffRes) return staffRes;
    return handleApiRouteError('PATCH /api/users/[id]', error, 'Staff could not be updated.');
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminStaff();
    const { id } = await context.params;
    await deactivateStaff(getStaffAccountDb(), actor, id);
    invalidateReferenceDataCaches();
    return NextResponse.json({ success: true });
  } catch (error) {
    const staffRes = staffErrorResponse(error);
    if (staffRes) return staffRes;
    return handleApiRouteError('DELETE /api/users/[id]', error, 'Staff could not be deactivated.');
  }
}
