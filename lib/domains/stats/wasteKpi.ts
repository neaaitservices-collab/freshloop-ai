/** Minimum gross sales ($) before waste % is shown (avoids absurd ratios with tiny denominators). */
export const MIN_GROSS_SALES_FOR_WASTE_RATIO = 100;

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
