import { InventoryLocation } from '@prisma/client';
import {
  prisma,
  getMovingAverageCost,
  getCurrentStock,
} from '@/lib/domains/inventory/ledger';
import {
  FALLBACK_RECIPES,
  type FallbackRecipeCatalogEntry,
} from '@/lib/domains/manufacturing/fallbackRecipes';
import type { KitchenRecipeDefinition } from '@/lib/domains/manufacturing/types';

const LOC_KITCHEN_PREP = InventoryLocation.Kitchen_Prep;

async function mapFallbackToKitchenRecipe(
  entry: FallbackRecipeCatalogEntry
): Promise<KitchenRecipeDefinition> {
  const bom = await Promise.all(
    entry.bomItems.map(async (bi) => {
      let mac = bi.defaultMacCost;
      let stock = 0;
      try {
        const [liveMac, liveStock] = await Promise.all([
          getMovingAverageCost(bi.ingredientProductId),
          getCurrentStock(bi.ingredientProductId, LOC_KITCHEN_PREP),
        ]);
        mac = liveMac;
        stock = liveStock;
      } catch {
        /* offline — keep defaults */
      }
      return {
        ingredientProductId: bi.ingredientProductId,
        name: bi.ingredientName,
        standardQtyPerBatch: bi.requiredQty,
        unit: String(bi.unit),
        movingAvgUnitCost: Number(mac.toFixed(4)),
        allowVariance: bi.allowVariance,
        availableKitchenStock: Number(stock.toFixed(2)),
      };
    })
  );

  return {
    recipeId: entry.id,
    recipeName: entry.name,
    category: 'Kitchen BOM',
    outputProductId: entry.outputProductId,
    outputProductName: entry.outputProductName,
    standardBatchYield: entry.batchYieldQty,
    outputUnit: String(entry.outputUnit),
    targetRetailPrice: entry.targetRetailPrice,
    prepTimeMinutes: 25,
    laborHours: entry.laborHours ?? 0,
    laborRatePerHour: entry.laborRatePerHour ?? 17.6,
    packagingCostPerUnit: entry.packagingCostPerUnit ?? 0,
    bom,
  };
}

export async function buildManufacturingRecipeCatalog(): Promise<
  KitchenRecipeDefinition[]
> {
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

      const bom = await Promise.all(
        dbRecipe.bomLines.map(async (bi) => {
          const pid = bi.ingredientProductId;
          let mac = bi.ingredientProduct.standardCost ?? 2;
          let stock = 0;
          try {
            const [liveMac, liveStock] = await Promise.all([
              getMovingAverageCost(pid),
              getCurrentStock(pid, LOC_KITCHEN_PREP),
            ]);
            mac = liveMac;
            stock = liveStock;
          } catch {
            /* keep defaults */
          }
          return {
            ingredientProductId: pid,
            name: bi.ingredientProduct.name,
            standardQtyPerBatch: Number(bi.quantityRequired ?? 0),
            unit: bi.unit ?? bi.ingredientProduct.unitType,
            movingAvgUnitCost: Number(mac.toFixed(4)),
            allowVariance: true,
            availableKitchenStock: Number(stock.toFixed(2)),
          };
        })
      );

      let defaultLaborRate = 17.6;
      try {
        const settings = await prisma.storeSetting.findFirst();
        if (settings?.defaultLaborRatePerHour) {
          defaultLaborRate = settings.defaultLaborRatePerHour;
        }
      } catch {
        /* offline */
      }

      byPrimaryId.set(dbRecipe.id, {
        recipeId: dbRecipe.id,
        recipeName: dbRecipe.name,
        category: dbRecipe.category ?? 'Kitchen BOM',
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
      byPrimaryId.set(fb.id, await mapFallbackToKitchenRecipe(fb));
    }
  }

  return Array.from(byPrimaryId.values());
}
