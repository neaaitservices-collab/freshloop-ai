import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { handleApiRouteError } from '@/lib/domains/ai/apiError';
import { getStaffDirectory } from '@/lib/domains/auth/staffDirectory';
import { authErrorResponse } from '@/lib/auth/http';
import { requireRoles, requireSessionUser } from '@/lib/auth/session';
import { MANAGER_ROLES } from '@/lib/auth/permissions';
import { setStaffHourlyRate } from '@/lib/auth/staffHourlyRate';
import { invalidateReferenceDataCaches } from '@/lib/domains/inventory/inventoryCache';
import { findLatestStoreSetting } from '@/lib/domains/stats/storeSettingSelect';
import { positionByLabel } from '@/lib/utils/positions';
import type { StaffUser } from '@/lib/utils/roles';

export const dynamic = 'force-dynamic';

const staffCoreSelect = {
  id: true,
  name: true,
  email: true,
  position: true,
  role: true,
  hourlyRate: true,
} as const;

function normalizeHourlyRate(hourlyRate: number | null | undefined): number | null {
  return hourlyRate != null && Number.isFinite(hourlyRate) && hourlyRate > 0
    ? Number(hourlyRate.toFixed(2))
    : null;
}

function toStaffUser(
  user: {
    id: string;
    name: string;
    email: string;
    position: string;
    role: Role;
    hourlyRate?: number | null;
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

export async function GET() {
  try {
    const sessionUser = await requireSessionUser();
    if (!MANAGER_ROLES.includes(sessionUser.role)) {
      return NextResponse.json({ success: true, users: [sessionUser] });
    }
    const users = await getStaffDirectory();
    return NextResponse.json({
      success: true,
      users,
    });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return handleApiRouteError('GET /api/users', error, 'Staff could not be loaded.');
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
      hourlyRate?: number;
    };
    const name = body.name?.trim() ?? '';
    const email = body.email?.trim().toLowerCase() ?? '';
    const assigned = positionByLabel(body.position ?? '');
    if (!name || !email || !assigned) {
      return NextResponse.json(
        {
          success: false,
          error: 'Name, email, and a position are required. Permissions follow that position.',
        },
        { status: 400 }
      );
    }
    let hourlyRate: number;
    if (body.hourlyRate !== undefined) {
      const parsed = Number(body.hourlyRate);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10_000) {
        return NextResponse.json(
          { success: false, error: 'Hourly wage must be a positive number.' },
          { status: 400 }
        );
      }
      hourlyRate = Number(parsed.toFixed(2));
    } else {
      const storeSetting = await findLatestStoreSetting();
      hourlyRate = Number((storeSetting?.defaultLaborRatePerHour ?? 17.6).toFixed(2));
    }
    const user = await prisma.user.create({
      data: {
        name,
        email,
        position: assigned.label,
        role: assigned.role,
      },
      select: staffCoreSelect,
    });
    const savedRate = await setStaffHourlyRate(user.id, hourlyRate);
    invalidateReferenceDataCaches();
    return NextResponse.json({
      success: true,
      user: toStaffUser(user, savedRate),
    });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return handleApiRouteError('POST /api/users', error, 'Staff could not be added.');
  }
}
