import { NextResponse } from 'next/server';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireOperationalStaff } from '@/lib/auth/guardRoute';
import { loadDepartmentCatalog } from '@/lib/domains/catalog/departmentRefStore';

export const dynamic = 'force-dynamic';

/** Active departments for the receive picker and catalogue filter. Enum labels if the table is empty. */
export async function GET() {
  try {
    await requireOperationalStaff();
    const catalog = await loadDepartmentCatalog();
    return NextResponse.json({
      success: true,
      source: catalog.source,
      departments: catalog.departments,
    });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Departments could not be loaded.');
  }
}
