import { calculateRealTimeWastePct, prisma, type WasteKpiReport } from '@/lib/domains/inventory/ledger';
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

export async function loadProductionBootstrapData(): Promise<ProductionBootstrapData> {
  const storeSettings = await getPlatformSettings();
  const salesDays = storeSettings.pullSensitivityDays;

  const [dbRecipes, wasteKpi, rawLevels] = await Promise.all([
    prisma.recipe.findMany({
      include: {
        outputProduct: true,
        bomLines: {
          include: {
            ingredientProduct: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    calculateRealTimeWastePct(),
    getStockLevelsWithPosSales(salesDays),
  ]);

  const snapshots = ingredientSnapshotsFromLevels(rawLevels);
  const activeBomRecipes = dbRecipes.filter((r) => r.status !== 'COMPLETED') as RecipeWithBom[];
  const manufacturingRecipes = await buildManufacturingRecipeCatalog({
    ingredientSnapshots: snapshots,
    recipeSource: activeBomRecipes,
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
