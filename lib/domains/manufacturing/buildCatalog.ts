import { InventoryLocation } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { rememberLedgerRead } from '@/lib/domains/inventory/ledgerCache';
import { getStockLevels } from '@/lib/domains/inventory/stock';
import {
  FALLBACK_RECIPES,
  type FallbackRecipeCatalogEntry,
} from '@/lib/domains/manufacturing/fallbackRecipes';
import type { KitchenRecipeDefinition } from '@/lib/domains/manufacturing/types';
import { findLatestStoreSetting } from '@/lib/domains/stats/storeSettingSelect';

type IngredientSnapshot = { prepStock: number; unitCost: number };

async function loadIngredientSnapshots(): Promise<Map<string, IngredientSnapshot>> {
  const levels = await getStockLevels();
  const map = new Map<string, IngredientSnapshot>();
  for (const row of levels) {
    map.set(row.productId, {
      prepStock: row.kitchenPrepQty,
      unitCost: row.unitCost > 0 ? row.unitCost : 0,
    });
  }
  return map;
}

function lineFromSnapshot(
  snapshots: Map<string, IngredientSnapshot>,
  ingredientProductId: string,
  name: string,
  standardQtyPerBatch: number,
  unit: string,
  fallbackMac: number,
  allowVariance: boolean
) {
  const snap = snapshots.get(ingredientProductId);
  const mac = snap && snap.unitCost > 0 ? snap.unitCost : fallbackMac;
  const stock = snap?.prepStock ?? 0;
  return {
    ingredientProductId,
    name,
    standardQtyPerBatch,
    unit,
    movingAvgUnitCost: Number(mac.toFixed(4)),
    allowVariance,
    availableKitchenStock: Number(stock.toFixed(2)),
  };
}

function mapFallbackToKitchenRecipe(
  entry: FallbackRecipeCatalogEntry,
  snapshots: Map<string, IngredientSnapshot>,
  defaultLaborRate: number
): KitchenRecipeDefinition {
  const bom = entry.bomItems.map((bi) =>
    lineFromSnapshot(
      snapshots,
      bi.ingredientProductId,
      bi.ingredientName,
      bi.requiredQty,
      String(bi.unit),
      bi.defaultMacCost,
      bi.allowVariance
    )
  );

  return {
    recipeId: entry.id,
    recipeName: entry.name,
    category: 'Production BOM',
    outputProductId: entry.outputProductId,
    outputProductName: entry.outputProductName,
    standardBatchYield: entry.batchYieldQty,
    outputUnit: String(entry.outputUnit),
    targetRetailPrice: entry.targetRetailPrice,
    prepTimeMinutes: 25,
    laborHours: entry.laborHours ?? 0,
    laborRatePerHour: entry.laborRatePerHour ?? defaultLaborRate,
    packagingCostPerUnit: entry.packagingCostPerUnit ?? 0,
    bom,
  };
}

async function buildManufacturingRecipeCatalogUncached(): Promise<KitchenRecipeDefinition[]> {
  const [snapshots, storeSetting] = await Promise.all([
    loadIngredientSnapshots(),
    findLatestStoreSetting().catch(() => null),
  ]);
  const defaultLaborRate = storeSetting?.defaultLaborRatePerHour ?? 17.6;

  const byPrimaryId = new Map<string, KitchenRecipeDefinition>();

  try {
    const dbRecipes = await prisma.recipe.findMany({
      where: { status: { not: 'COMPLETED' } },
      include: {
        outputProduct: true,
        bomLines: { include: { ingredientProduct: true } },
      },
      orderBy: { name: 'asc' },
    });

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
          true
        )
      );

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
        packagingCostPerUnit: Number(dbRecipe.packagingCostPerUnit ?? 0),
        bom,
      });
    }
  } catch {
    /* DB offline */
  }

  if (byPrimaryId.size === 0) {
    for (const fb of FALLBACK_RECIPES) {
      if (!fb.isActive) continue;
      byPrimaryId.set(
        fb.id,
        mapFallbackToKitchenRecipe(fb, snapshots, defaultLaborRate)
      );
    }
  }

  return Array.from(byPrimaryId.values());
}

const catalogCache = new Map<
  string,
  { at: number; gen: number; value: Promise<KitchenRecipeDefinition[]> }
>();

const CATALOG_CACHE_MS = 60_000;

export function buildManufacturingRecipeCatalog(): Promise<KitchenRecipeDefinition[]> {
  return rememberLedgerRead(
    catalogCache,
    'manufacturing-recipes',
    CATALOG_CACHE_MS,
    buildManufacturingRecipeCatalogUncached
  );
}
