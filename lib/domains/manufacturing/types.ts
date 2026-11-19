export interface KitchenRecipeBOMIngredient {
  ingredientProductId: string;
  name: string;
  standardQtyPerBatch: number;
  unit: string;
  movingAvgUnitCost: number;
  allowVariance: boolean;
  availableKitchenStock: number;
  /** Positive stock-snapshot unit cost when the sheet has one. Null when it does not. */
  movingAverageCost?: number | null;
  /** Catalog standardCost. Null when the product has no cost on file. */
  catalogStandardCost?: number | null;
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
  /** Recipe row rate. Null when laborRatePerHour was filled from a default. */
  recipeLaborRate?: number | null;
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
