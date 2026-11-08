import { NextRequest, NextResponse } from 'next/server';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireManagerStaff } from '@/lib/auth/guardRoute';
import {
  getBuyListLevelsWithForecast,
  resolveBuyForecastConfig,
} from '@/lib/domains/inventory/forecasting';
import { buyForecastQuerySchema } from '@/lib/security/schemas/buyForecast';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireManagerStaff();
    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const query = buyForecastQuerySchema.parse(raw);
    const config = resolveBuyForecastConfig({
      velocityLookbackDays: query.lookbackDays,
      leadTimeDays: query.leadTimeDays,
      safetyStockDays: query.safetyDays,
      hooks: {
        seasonalFactor: query.seasonalFactor,
      },
    });
    const levels = await getBuyListLevelsWithForecast(config);
    const low = levels.filter((row) => row.low);
    const forecastDriven = low.filter((row) => row.forecastDriven);
    return NextResponse.json({
      success: true,
      config: {
        lookbackDays: config.velocityLookbackDays,
        leadTimeDays: config.leadTimeDays,
        safetyDays: config.safetyStockDays,
        seasonalFactor: config.hooks.seasonalFactor ?? 1,
      },
      count: levels.length,
      lowCount: low.length,
      forecastDrivenCount: forecastDriven.length,
      orderCost: Number(low.reduce((sum, row) => sum + row.orderCost, 0).toFixed(2)),
      levels,
    });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Buy list forecast could not be loaded.');
  }
}
