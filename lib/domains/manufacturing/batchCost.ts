/**
 * Batch cost math aligned with Brynn's Sheets:
 * Total = ingredients + (laborHours × laborRate) + (packagingPerUnit × yieldUnits)
 */

export interface RecipeBatchCostInput {
  ingredientCost: number;
  laborHours: number;
  laborRatePerHour: number;
  packagingCostPerUnit: number;
  yieldUnits: number;
}

export interface RecipeBatchCostBreakdown {
  ingredientCost: number;
  laborCost: number;
  packagingCost: number;
  totalBatchCost: number;
  unitCost: number;
  grossMarginPct: (retailPrice: number) => number;
}

export function computeRecipeBatchCost(input: RecipeBatchCostInput): RecipeBatchCostBreakdown {
  const ingredientCost = Number(Math.max(0, input.ingredientCost).toFixed(4));
  const laborHours = Math.max(0, input.laborHours);
  const laborRate = Math.max(0, input.laborRatePerHour);
  const packagingPerUnit = Math.max(0, input.packagingCostPerUnit);
  const yieldUnits = Math.max(0, input.yieldUnits);

  const laborCost = Number((laborHours * laborRate).toFixed(4));
  const packagingCost = Number((packagingPerUnit * yieldUnits).toFixed(4));
  const totalBatchCost = Number((ingredientCost + laborCost + packagingCost).toFixed(4));
  const unitCost = yieldUnits > 0 ? Number((totalBatchCost / yieldUnits).toFixed(4)) : 0;

  return {
    ingredientCost,
    laborCost,
    packagingCost,
    totalBatchCost,
    unitCost,
    grossMarginPct: (retailPrice: number) => {
      if (!Number.isFinite(retailPrice) || retailPrice <= 0) return 0;
      return Number((((retailPrice - unitCost) / retailPrice) * 100).toFixed(1));
    },
  };
}

/** Scale labor with batch size; packaging follows actual output units. */
export function computeScaledBatchCost(
  base: Omit<RecipeBatchCostInput, 'yieldUnits'> & {
    standardYield: number;
    actualBatchOutput: number;
  }
): RecipeBatchCostBreakdown {
  const standardYield = base.standardYield > 0 ? base.standardYield : base.actualBatchOutput;
  const scale = base.actualBatchOutput / standardYield;
  return computeRecipeBatchCost({
    ingredientCost: base.ingredientCost,
    laborHours: base.laborHours * scale,
    laborRatePerHour: base.laborRatePerHour,
    packagingCostPerUnit: base.packagingCostPerUnit,
    yieldUnits: base.actualBatchOutput,
  });
}
