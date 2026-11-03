const DEFAULT_LABOR_RATE = 17.6;

/** Labor $/hr for batch costing: operator wage → recipe rate → store default. */
export function resolveLaborRatePerHour(input: {
  staffHourlyRate?: number | null;
  recipeLaborRate?: number | null;
  storeDefaultLaborRate?: number | null;
}): number {
  const staff = finitePositive(input.staffHourlyRate);
  if (staff != null) return staff;

  const recipe = finitePositive(input.recipeLaborRate);
  if (recipe != null) return recipe;

  const store = finitePositive(input.storeDefaultLaborRate);
  if (store != null) return store;

  return DEFAULT_LABOR_RATE;
}

function finitePositive(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Number(n.toFixed(4));
}
