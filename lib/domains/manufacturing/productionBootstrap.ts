import { getCachedRealTimeWastePct, prisma, type WasteKpiReport } from '@/lib/domains/inventory/ledger';
import {
  RECIPE_API_LIST_SELECT,
  type RecipeApiListRow,
} from '@/lib/domains/manufacturing/recipeListSelect';
import { rememberLedgerRead } from '@/lib/domains/inventory/ledgerCache';
import { getStockLevelsWithPosSales, type StockLevel } from '@/lib/domains/inventory/stock';
import { filterLevelsWithAnyStock } from '@/lib/domains/inventory/subInventoryView';
import {
  buildManufacturingRecipeCatalog,
  ingredientSnapshotsFromLevels,
  type RecipeWithBom,
} from '@/lib/domains/manufacturing/buildCatalog';
import {
  mapDbRecipeToFusionResult,
  type DbRecipeForCard,
} from '@/lib/domains/manufacturing/mapDbRecipeToFusion';
import type { KitchenRecipeDefinition } from '@/lib/domains/manufacturing/types';
import { getPlatformSettings, type PlatformSettings } from '@/lib/domains/stats/platformSettings';
import type { RecipeFusionResult } from '@/lib/types';

export interface ProductionBootstrapData {
  recipes: RecipeFusionResult[];
  savedRecipeCount: number;
  manufacturingRecipes: KitchenRecipeDefinition[];
  wasteKpi: WasteKpiReport;
  storeSettings: PlatformSettings;
  levelsSummary: StockLevel[];
}

async function loadBootstrapRecipes(): Promise<RecipeApiListRow[]> {
  return prisma.recipe.findMany({
    select: RECIPE_API_LIST_SELECT,
    orderBy: { createdAt: 'desc' },
  });
}

const BOOTSTRAP_CACHE_MS = 45_000;
const bootstrapCache = new Map<
  string,
  { at: number; gen: number; value: Promise<ProductionBootstrapData> }
>();

async function loadProductionBootstrapDataUncached(): Promise<ProductionBootstrapData> {
  const storeSettingsPromise = getPlatformSettings();

  const [storeSettings, dbRecipes, wasteKpi, rawLevels] = await Promise.all([
    storeSettingsPromise,
    loadBootstrapRecipes(),
    getCachedRealTimeWastePct(),
    storeSettingsPromise.then((s) => getStockLevelsWithPosSales(s.pullSensitivityDays)),
  ]);

  const snapshots = ingredientSnapshotsFromLevels(rawLevels);
  const activeBomRecipes = dbRecipes.filter((r) => r.status !== 'COMPLETED');
  const manufacturingRecipes = await buildManufacturingRecipeCatalog({
    ingredientSnapshots: snapshots,
    recipeSource: activeBomRecipes as RecipeWithBom[],
  });

  const recipes = dbRecipes.map((r) => mapDbRecipeToFusionResult(r as DbRecipeForCard));
  const levelsSummary = filterLevelsWithAnyStock(rawLevels);

  return {
    recipes,
    savedRecipeCount: recipes.length,
    manufacturingRecipes,
    wasteKpi,
    storeSettings,
    levelsSummary,
  };
}

/** Single initial payload for `/production` (recipes, BOM catalog, waste KPI, settings, stock levels). */
export function loadProductionBootstrapData(): Promise<ProductionBootstrapData> {
  return rememberLedgerRead(
    bootstrapCache,
    'production-bootstrap',
    BOOTSTRAP_CACHE_MS,
    loadProductionBootstrapDataUncached
  );
}
