import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { handleApiRouteError } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireRoles, requireSessionUser } from '@/lib/auth/session';
import { MANAGER_ROLES } from '@/lib/auth/permissions';
import { getStaffHourlyRateMap, setStaffHourlyRate } from '@/lib/auth/staffHourlyRate';
import { findLatestStoreSetting } from '@/lib/domains/stats/storeSettingSelect';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { staffCreateBodySchema } from '@/lib/security/schemas/staff';
import { positionByLabel } from '@/lib/utils/positions';
import type { StaffUser } from '@/lib/utils/roles';

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

export async function GET() {
  try {
    const sessionUser = await requireSessionUser();
    if (!MANAGER_ROLES.includes(sessionUser.role)) {
      return NextResponse.json({ success: true, users: [sessionUser] });
    }
    const users = await prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: staffCoreSelect,
    });
    const rateMap = await getStaffHourlyRateMap(users.map((u) => u.id));
    return NextResponse.json({
      success: true,
      users: users.map((u) => toStaffUser(u, rateMap.get(u.id) ?? null)),
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
    const body = await parseJsonBody(req, staffCreateBodySchema);
    const name = body.name.trim();
    const email = body.email.trim().toLowerCase();
    const assigned = positionByLabel(body.position);
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
      hourlyRate = Number(body.hourlyRate.toFixed(2));
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
