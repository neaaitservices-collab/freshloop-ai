import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { rememberLedgerRead } from '@/lib/domains/inventory/ledgerCache';
import { getStockLevels, type StockLevel } from '@/lib/domains/inventory/stock';
import { isDatabaseUnreachableError } from '@/lib/domains/manufacturing/fallbackRecipes';
import type { KitchenRecipeDefinition } from '@/lib/domains/manufacturing/types';
import { findLatestStoreSetting } from '@/lib/domains/stats/storeSettingSelect';

type IngredientSnapshot = { prepStock: number; unitCost: number };

export type RecipeWithBom = Prisma.RecipeGetPayload<{
  include: {
    outputProduct: true;
    bomLines: { include: { ingredientProduct: true } };
  };
}>;

export type BuildManufacturingCatalogOptions = {
  ingredientSnapshots?: Map<string, IngredientSnapshot>;
  /** Active BOM rows — skips a second Prisma recipe round-trip when provided. */
  recipeSource?: RecipeWithBom[];
};

export function ingredientSnapshotsFromLevels(
  levels: StockLevel[]
): Map<string, IngredientSnapshot> {
  const map = new Map<string, IngredientSnapshot>();
  for (const row of levels) {
    map.set(row.productId, {
      prepStock: row.kitchenPrepQty,
      unitCost: row.unitCost > 0 ? row.unitCost : 0,
    });
  }
  return map;
}

async function loadIngredientSnapshots(): Promise<Map<string, IngredientSnapshot>> {
  const levels = await getStockLevels();
  return ingredientSnapshotsFromLevels(levels);
}

function lineFromSnapshot(
  snapshots: Map<string, IngredientSnapshot>,
  ingredientProductId: string,
  name: string,
  standardQtyPerBatch: number,
  unit: string,
  fallbackMac: number,
  allowVariance: boolean,
  costSources?: {
    movingAverageCost?: number | null;
    standardCost?: number | null;
  }
) {
  const snap = snapshots.get(ingredientProductId);
  const mac = snap && snap.unitCost > 0 ? snap.unitCost : fallbackMac;
  const stock = snap?.prepStock ?? 0;
  const movingAverageCost =
    costSources && 'movingAverageCost' in costSources
      ? costSources.movingAverageCost ?? null
      : snap && snap.unitCost > 0
        ? Number(snap.unitCost.toFixed(4))
        : null;
  const catalogStandardCost =
    costSources && 'standardCost' in costSources ? costSources.standardCost ?? null : null;
  return {
    ingredientProductId,
    name,
    standardQtyPerBatch,
    unit,
    movingAvgUnitCost: Number(mac.toFixed(4)),
    movingAverageCost,
    catalogStandardCost,
    allowVariance,
    availableKitchenStock: Number(stock.toFixed(2)),
  };
}

function mapDbRecipesToKitchenDefinitions(
  dbRecipes: RecipeWithBom[],
  snapshots: Map<string, IngredientSnapshot>,
  defaultLaborRate: number,
  byPrimaryId: Map<string, KitchenRecipeDefinition>
): void {
  for (const dbRecipe of dbRecipes) {
      if (dbRecipe.bomLines.length === 0) continue;

      const bom = dbRecipe.bomLines.map((bi) =>
        lineFromSnapshot(
          snapshots,
          bi.ingredientProductId,
          bi.ingredientProduct.name,
          Number(bi.quantityRequired ?? 0),
          bi.unit ?? bi.ingredientProduct.unitType,
          bi.ingredientProduct.standardCost ?? 2,
          true,
          {
            standardCost:
              bi.ingredientProduct.standardCost == null
                ? null
                : Number(bi.ingredientProduct.standardCost),
          }
        )
      );
      const recipeLaborRate =
        dbRecipe.laborRate != null && Number(dbRecipe.laborRate) > 0
          ? Number(dbRecipe.laborRate)
          : null;

      byPrimaryId.set(dbRecipe.id, {
        recipeId: dbRecipe.id,
        recipeName: dbRecipe.name,
        category: dbRecipe.category ?? 'Production BOM',
        outputProductId: dbRecipe.outputProductId,
        outputProductName: dbRecipe.outputProduct.name,
        standardBatchYield: Number(dbRecipe.yieldPortions ?? 1),
        outputUnit: dbRecipe.outputProduct.unitType,
        targetRetailPrice: Number(dbRecipe.targetRetailPrice ?? 0),
        prepTimeMinutes: 25,
        laborHours: Number(dbRecipe.laborHours ?? 0),
        laborRatePerHour: Number(dbRecipe.laborRate ?? defaultLaborRate),
        recipeLaborRate,
        packagingCostPerUnit: Number(dbRecipe.packagingCostPerUnit ?? 0),
        bom,
        fallback: false,
        readOnly: false,
      });
  }
}

/**
 * Saved BOM rows only. An empty catalog stays empty.
 * Connection failures and other read errors throw — they do not fill in demo recipes.
 */
export function selectManufacturingCatalog(input: {
  error: unknown | null;
  saved: KitchenRecipeDefinition[];
}): KitchenRecipeDefinition[] {
  if (input.error != null) throw input.error;
  return input.saved;
}

async function buildManufacturingRecipeCatalogUncached(
  options?: BuildManufacturingCatalogOptions
): Promise<KitchenRecipeDefinition[]> {
  const snapshots = options?.ingredientSnapshots ?? (await loadIngredientSnapshots());
  const storeSetting = await findLatestStoreSetting().catch((error: unknown) => {
    if (isDatabaseUnreachableError(error)) throw error;
    return null;
  });
  const defaultLaborRate = storeSetting?.defaultLaborRatePerHour ?? 17.6;

  const byPrimaryId = new Map<string, KitchenRecipeDefinition>();

  if (options?.recipeSource) {
    mapDbRecipesToKitchenDefinitions(
      options.recipeSource,
      snapshots,
      defaultLaborRate,
      byPrimaryId
    );
  } else {
    try {
      const dbRecipes = await prisma.recipe.findMany({
        where: { status: { not: 'COMPLETED' } },
        include: {
          outputProduct: true,
          bomLines: { include: { ingredientProduct: true } },
        },
        orderBy: { name: 'asc' },
      });
      mapDbRecipesToKitchenDefinitions(dbRecipes, snapshots, defaultLaborRate, byPrimaryId);
    } catch (error) {
      return selectManufacturingCatalog({ error, saved: [] });
    }
  }

  return selectManufacturingCatalog({
    error: null,
    saved: Array.from(byPrimaryId.values()),
  });
}

const catalogCache = new Map<
  string,
  { at: number; gen: number; value: Promise<KitchenRecipeDefinition[]> }
>();

const CATALOG_CACHE_MS = 60_000;

export function buildManufacturingRecipeCatalog(
  options?: BuildManufacturingCatalogOptions
): Promise<KitchenRecipeDefinition[]> {
  if (options?.ingredientSnapshots || options?.recipeSource) {
    return buildManufacturingRecipeCatalogUncached(options);
  }
  return rememberLedgerRead(
    catalogCache,
    'manufacturing-recipes',
    CATALOG_CACHE_MS,
    () => buildManufacturingRecipeCatalogUncached()
  );
}
