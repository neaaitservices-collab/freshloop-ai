import { NextResponse } from 'next/server';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireRoles } from '@/lib/auth/session';
import { MANUFACTURING_ROLES } from '@/lib/auth/permissions';
import { loadProductionBootstrapData } from '@/lib/domains/manufacturing/productionBootstrap';

export const dynamic = 'force-dynamic';

/** Single initial payload for `/production` (recipes, BOM catalog, waste KPI, settings, stock levels). */
export async function GET() {
  try {
    await requireRoles(MANUFACTURING_ROLES);
    const data = await loadProductionBootstrapData();
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Production workspace could not be loaded.');
  }
}
