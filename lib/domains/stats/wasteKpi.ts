/** Minimum gross sales ($) before waste % is shown (avoids absurd ratios with tiny denominators). */
export const MIN_GROSS_SALES_FOR_WASTE_RATIO = 100;

/** Rolling window for waste KPI and admin rescue/waste charts (days). */
export const DEFAULT_KPI_LOOKBACK_DAYS = 30;

export function kpiLookbackRange(
  lookbackDays: number = DEFAULT_KPI_LOOKBACK_DAYS,
  end: Date = new Date()
): { startDate: Date; endDate: Date } {
  const endDate = new Date(end);
  const startDate = new Date(endDate);
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - (lookbackDays - 1));
  return { startDate, endDate };
}

/**
 * Headline for the admin waste card. A null ratio (sales under the floor) stays a dash.
 * Callers must not substitute an unofficial percentage in that case.
 */
export function officialWastePctLabel(wastePct: number | null | undefined): string {
  if (wastePct == null || !Number.isFinite(wastePct)) return '—';
  if (wastePct > 100) return '>100%';
  return `${wastePct.toFixed(1)}%`;
}

export function computeWastePct(
  totalWasteValue: number,
  grossSalesRevenue: number
): number | null {
  if (!Number.isFinite(grossSalesRevenue) || grossSalesRevenue < MIN_GROSS_SALES_FOR_WASTE_RATIO) {
    return null;
  }
  if (!Number.isFinite(totalWasteValue) || totalWasteValue <= 0) {
    return 0;
  }
  const pct = (totalWasteValue / grossSalesRevenue) * 100;
  return Number(Math.min(999.99, pct).toFixed(2));
}
