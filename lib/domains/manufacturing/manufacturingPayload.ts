export interface ManufacturingPayloadInput {
  recipe_id: string;
  batch_output: number;
  ingredient_overrides?: Array<{
    ingredient_product_id: string;
    actual_qty_used: number;
  }>;
  enforce_stock_check?: boolean;
  notes?: string | null;
}

export interface CanonicalManufacturingPayload {
  recipe_id: string;
  batch_output: number;
  ingredient_overrides: Array<{
    ingredient_product_id: string;
    actual_qty_used: number;
  }>;
  enforce_stock_check: boolean | null;
  notes: string | null;
}

/** Stable request identity. Array order is significant; numbers are not reformatted. */
export function canonicalManufacturingPayload(
  input: ManufacturingPayloadInput
): CanonicalManufacturingPayload {
  return {
    recipe_id: input.recipe_id.trim(),
    batch_output: input.batch_output,
    ingredient_overrides: (input.ingredient_overrides ?? []).map((row) => ({
      ingredient_product_id: row.ingredient_product_id.trim(),
      actual_qty_used: Number(row.actual_qty_used),
    })),
    enforce_stock_check:
      input.enforce_stock_check === undefined ? null : input.enforce_stock_check,
    notes: input.notes?.trim() ? input.notes.trim() : null,
  };
}

export function manufacturingPayloadKey(input: ManufacturingPayloadInput): string {
  return JSON.stringify(canonicalManufacturingPayload(input));
}
