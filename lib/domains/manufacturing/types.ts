export interface KitchenRecipeBOMIngredient {
  ingredientProductId: string;
  name: string;
  standardQtyPerBatch: number;
  unit: string;
  movingAvgUnitCost: number;
  allowVariance: boolean;
  availableKitchenStock: number;
}

export interface KitchenRecipeDefinition {
  recipeId: string;
  recipeName: string;
  category: string;
  outputProductId: string;
  outputProductName: string;
  standardBatchYield: number;
  outputUnit: string;
  targetRetailPrice: number;
  prepTimeMinutes: number;
  laborHours: number;
  laborRatePerHour: number;
  packagingCostPerUnit: number;
  bom: KitchenRecipeBOMIngredient[];
  /** True only when the database could not be reached and this row is display-only. */
  fallback?: boolean;
  readOnly?: boolean;
}

export interface ProductionBatchExecutedSummary {
  recipeId: string;
  recipeName: string;
  outputProductId: string;
  outputProductName: string;
  batchOutputQty: number;
  totalBatchCost: number;
  unitOutputCost: number;
  ingredientsUsed: Array<{
    ingredientProductId: string;
    name: string;
    actualQtyUsed: number;
    unit: string;
  }>;
}
