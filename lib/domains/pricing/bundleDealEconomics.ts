/** Economics for single-SKU quantity bundle deals (e.g. buy 2 for $8). */

/** Floor / signage promos: alert managers when profit % falls below this. */
export const BUNDLE_MARGIN_ALERT_PCT = 15;

export function isBundleMarginBelowAlert(marginPct: number | null): boolean {
  return marginPct != null && marginPct < BUNDLE_MARGIN_ALERT_PCT;
}

export function bundleMarginDisplayClass(
  marginPct: number | null,
  tone: BundleDealEconomics['marginTone']
): string {
  if (tone === 'loss' || (marginPct != null && marginPct < 0)) {
    return 'text-rose-300';
  }
  if (isBundleMarginBelowAlert(marginPct)) {
    return 'text-amber-200';
  }
  return 'text-emerald-300';
}

export type BundleDealEconomics = {
  minUnits: number;
  bundlePrice: number;
  unitCost: number;
  cogsTotal: number;
  marginPct: number | null;
  marginTone: 'loss' | 'thin' | 'ok';
  regularUnitPrice: number | null;
  regularTotal: number | null;
  savingsVsRegular: number | null;
  effectiveUnitPrice: number;
};

export function computeBundleDealEconomics(input: {
  minUnits: number;
  bundlePrice: number;
  unitCost: number;
  regularUnitPrice?: number | null;
}): BundleDealEconomics {
  const minUnits = Math.max(2, Math.floor(input.minUnits));
  const bundlePrice = Math.max(0, Number(input.bundlePrice));
  const unitCost = Math.max(0, Number(input.unitCost));
  const cogsTotal = Number((unitCost * minUnits).toFixed(2));
  const marginPct =
    bundlePrice > 0 ? Number((((bundlePrice - cogsTotal) / bundlePrice) * 100).toFixed(1)) : null;
  const regularUnitPrice =
    input.regularUnitPrice != null && input.regularUnitPrice > 0
      ? Number(input.regularUnitPrice)
      : null;
  const regularTotal =
    regularUnitPrice != null ? Number((regularUnitPrice * minUnits).toFixed(2)) : null;
  const savingsVsRegular =
    regularTotal != null ? Number((regularTotal - bundlePrice).toFixed(2)) : null;
  const effectiveUnitPrice =
    minUnits > 0 ? Number((bundlePrice / minUnits).toFixed(2)) : bundlePrice;

  let marginTone: BundleDealEconomics['marginTone'] = 'ok';
  if (marginPct != null) {
    if (marginPct < 0) marginTone = 'loss';
    else if (marginPct < BUNDLE_MARGIN_ALERT_PCT) marginTone = 'thin';
  }

  return {
    minUnits,
    bundlePrice,
    unitCost,
    cogsTotal,
    marginPct,
    marginTone,
    regularUnitPrice,
    regularTotal,
    savingsVsRegular,
    effectiveUnitPrice,
  };
}
