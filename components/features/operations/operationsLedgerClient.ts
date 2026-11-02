import type { WasteKpiReport } from '@/lib/domains/inventory/ledger';
import { mapDbRecipeToFusionResult } from '@/lib/domains/manufacturing/mapDbRecipeToFusion';
import type { RecipeFusionResult } from '@/lib/types';

export interface OperationsDashboardSnapshot {
  recipes: RecipeFusionResult[];
  wasteKpi: WasteKpiReport | null;
}

/** Recipes + waste KPI for Operations shell (no read-only sub-inventory tables). */
export async function fetchOperationsDashboardSnapshot(): Promise<OperationsDashboardSnapshot> {
  const [recipesRes, statsRes] = await Promise.all([
    fetch('/api/recipes', { cache: 'no-store' }),
    fetch('/api/admin/stats', { cache: 'no-store' }),
  ]);

  const recipesJson = await recipesRes.json().catch(() => null);
  const statsJson = (await statsRes.json().catch(() => null)) as {
    success?: boolean;
    wasteKpi?: WasteKpiReport;
  } | null;

  let recipes: RecipeFusionResult[] = [];
  if (
    recipesJson?.success &&
    Array.isArray(recipesJson.recipes) &&
    recipesJson.recipes.length > 0
  ) {
    recipes = recipesJson.recipes.map(mapDbRecipeToFusionResult);
  }

  const wasteKpi =
    statsJson?.success && statsJson.wasteKpi ? statsJson.wasteKpi : null;

  return { recipes, wasteKpi };
}

/** @deprecated Use fetchOperationsDashboardSnapshot */
export async function fetchOperationsLedgerSnapshot(pullSensitivityDays: number) {
  void pullSensitivityDays;
  return fetchOperationsDashboardSnapshot();
}
