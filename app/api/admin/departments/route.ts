import { NextRequest, NextResponse } from 'next/server';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireDepartmentEditor, requireDepartmentViewer } from '@/lib/auth/guardRoute';
import { runDepartmentAdmin } from '@/lib/domains/catalog/departmentAdmin';
import { departmentAdminDb } from '@/lib/domains/catalog/departmentAdminStore';
import { InvalidJsonBodyError } from '@/lib/security/parseJsonBody';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

function jsonResult(result: { status: number; body: unknown }) {
  return NextResponse.json(result.body, { status: result.status });
}

async function readBody(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new InvalidJsonBodyError();
  }
}

export async function GET() {
  try {
    const actor = await requireDepartmentViewer();
    const result = await runDepartmentAdmin({
      role: actor.role,
      method: 'GET',
      db: departmentAdminDb,
    });
    return jsonResult(result);
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Departments could not be loaded.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireDepartmentEditor();
    const limited = assertMutationRateLimit(actor.id, 'admin-departments-create', 30);
    if (limited) return limited;
    const result = await runDepartmentAdmin({
      role: actor.role,
      method: 'POST',
      body: await readBody(req),
      db: departmentAdminDb,
    });
    return jsonResult(result);
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Department could not be added.');
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await requireDepartmentEditor();
    const limited = assertMutationRateLimit(actor.id, 'admin-departments-update', 60);
    if (limited) return limited;
    const result = await runDepartmentAdmin({
      role: actor.role,
      method: 'PATCH',
      body: await readBody(req),
      db: departmentAdminDb,
    });
    return jsonResult(result);
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Department could not be saved.');
  }
}
