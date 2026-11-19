/**
 * Batch cost math aligned with Brynn's Sheets:
 * Total = ingredients + (laborHours × laborRate) + (packagingPerUnit × yieldUnits)
 */

/** Catalog stand-in when an ingredient has no moving average and no standardCost. */
export const STANDARD_COST_FALLBACK_USD = 2;

export const STANDARD_COST_FALLBACK_NOTE = 'est. $2.00, no cost on file';

export interface BatchIngredientCostSource {
  ingredientProductId?: string | null;
  name: string;
  /** Positive ledger moving-average unit cost, when one exists. */
  movingAverageCost?: number | null;
  /** Catalog standardCost. Null when nothing is on file. Zero is on file. */
  standardCost?: number | null;
}

export interface StandardCostFallbackFlag {
  ingredientProductId: string | null;
  name: string;
  unitCost: number;
  standardCostFallback: true;
}

export interface RecipeBatchCostInput {
  ingredientCost: number;
  laborHours: number;
  laborRatePerHour: number;
  packagingCostPerUnit: number;
  yieldUnits: number;
  /** Informational only. Does not change ingredientCost. */
  ingredients?: BatchIngredientCostSource[];
  /** Informational only. Does not change laborRatePerHour. */
  laborRateIsDefault?: boolean;
}

export interface RecipeBatchCostBreakdown {
  ingredientCost: number;
  laborCost: number;
  packagingCost: number;
  totalBatchCost: number;
  unitCost: number;
  grossMarginPct: (retailPrice: number) => number;
  standardCostFallbacks: StandardCostFallbackFlag[];
  laborRateIsDefault: boolean;
}

function positiveCost(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

/** True only when the $2 stand-in is the cost: no positive moving average and no standardCost on file. */
export function ingredientUsesStandardCostFallback(input: {
  movingAverageCost?: number | null;
  standardCost?: number | null;
}): boolean {
  if (positiveCost(input.movingAverageCost) != null) return false;
  if (typeof input.standardCost === 'number' && Number.isFinite(input.standardCost)) return false;
  return true;
}

function costFlags(input: {
  ingredients?: BatchIngredientCostSource[];
  laborRateIsDefault?: boolean;
}): Pick<RecipeBatchCostBreakdown, 'standardCostFallbacks' | 'laborRateIsDefault'> {
  const standardCostFallbacks = (input.ingredients ?? [])
    .filter((line) => ingredientUsesStandardCostFallback(line))
    .map((line) => ({
      ingredientProductId: line.ingredientProductId ?? null,
      name: line.name,
      unitCost: STANDARD_COST_FALLBACK_USD,
      standardCostFallback: true as const,
    }));
  return {
    standardCostFallbacks,
    laborRateIsDefault: input.laborRateIsDefault === true,
  };
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
    ...costFlags(input),
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
    ingredients: base.ingredients,
    laborRateIsDefault: base.laborRateIsDefault,
  });
}
