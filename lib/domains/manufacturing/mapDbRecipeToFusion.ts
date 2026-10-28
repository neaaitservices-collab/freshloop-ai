import type { RecipeFusionResult } from '@/lib/types';
import { computeRecipeBatchCost } from '@/lib/domains/manufacturing/batchCost';

export type DbRecipeForCard = {
  id: string;
  name: string;
  category?: string | null;
  targetRetailPrice?: number | null;
  yieldPortions?: number;
  laborHours?: number | null;
  laborRate?: number | null;
  packagingCostPerUnit?: number | null;
  instructions?: string | null;
  createdAt?: Date | string;
  bomLines?: Array<{
    quantityRequired: number;
    ingredientProduct?: { name: string; standardCost?: number | null };
  }>;
};

const FUSION_CATEGORIES: RecipeFusionResult['category'][] = [
  'Soup',
  'Salad / Panzanella',
  'Parfait / Dessert',
  'Prepared Hot Meal',
  'Bakery / Bread',
];

function normalizeCategory(raw: string | null | undefined): RecipeFusionResult['category'] {
  if (!raw) return 'Prepared Hot Meal';
  const match = FUSION_CATEGORIES.find((c) => c.toLowerCase() === raw.toLowerCase());
  if (match) return match;
  if (raw.toLowerCase().includes('panzanella')) return 'Salad / Panzanella';
  if (raw.toLowerCase().includes('parfait')) return 'Parfait / Dessert';
  if (raw.toLowerCase().includes('bakery') || raw.toLowerCase().includes('bread')) {
    return 'Bakery / Bread';
  }
  if (raw.toLowerCase().includes('soup')) return 'Soup';
  return 'Prepared Hot Meal';
}

export function mapDbRecipeToFusionResult(r: DbRecipeForCard): RecipeFusionResult {
  const ingredientCost = (r.bomLines ?? []).reduce(
    (sum, line) =>
      sum + line.quantityRequired * Number(line.ingredientProduct?.standardCost ?? 0),
    0
  );
  const yieldPortions = Math.max(0, r.yieldPortions ?? 0);
  const retail = Number(r.targetRetailPrice ?? 0);
  const batch = computeRecipeBatchCost({
    ingredientCost,
    laborHours: Number(r.laborHours ?? 0),
    laborRatePerHour: Number(r.laborRate ?? 17.6),
    packagingCostPerUnit: Number(r.packagingCostPerUnit ?? 0),
    yieldUnits: yieldPortions || 1,
  });

  return {
    id: r.id,
    recipeName: r.name,
    category: normalizeCategory(r.category),
    ingredientsUsed: (r.bomLines ?? []).map((line) => ({
      name: line.ingredientProduct?.name ?? 'Ingredient',
      quantity: String(line.quantityRequired),
      department: 'PANTRY',
      estimatedCost:
        line.quantityRequired * Number(line.ingredientProduct?.standardCost ?? 0),
    })),
    estimatedYield: yieldPortions ? `${yieldPortions} portions` : '—',
    estimatedCost: batch.totalBatchCost,
    targetRetailPrice: retail,
    grossMarginPct: batch.grossMarginPct(retail),
    instructions: r.instructions
      ? r.instructions.split(/\n+/).filter((s) => s.trim().length > 0)
      : [],
    prepTimeMinutes: 0,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
  };
}
