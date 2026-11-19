const DEFAULT_LABOR_RATE = 17.6;

export const DEFAULT_LABOR_RATE_NOTE = 'Default labor rate';

export interface ResolvedLaborRate {
  ratePerHour: number;
  /** True when the rate is the store default or the $17.60 stand-in, not a wage or recipe rate. */
  isDefault: boolean;
}

/** Labor $/hr for batch costing: operator wage → recipe rate → store default → $17.60. */
export function resolveLaborRate(input: {
  staffHourlyRate?: number | null;
  recipeLaborRate?: number | null;
  storeDefaultLaborRate?: number | null;
}): ResolvedLaborRate {
  const staff = finitePositive(input.staffHourlyRate);
  if (staff != null) return { ratePerHour: staff, isDefault: false };

  const recipe = finitePositive(input.recipeLaborRate);
  if (recipe != null) return { ratePerHour: recipe, isDefault: false };

  const store = finitePositive(input.storeDefaultLaborRate);
  if (store != null) return { ratePerHour: store, isDefault: true };

  return { ratePerHour: DEFAULT_LABOR_RATE, isDefault: true };
}

export function resolveLaborRatePerHour(input: {
  staffHourlyRate?: number | null;
  recipeLaborRate?: number | null;
  storeDefaultLaborRate?: number | null;
}): number {
  return resolveLaborRate(input).ratePerHour;
}

function finitePositive(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Number(n.toFixed(4));
}
