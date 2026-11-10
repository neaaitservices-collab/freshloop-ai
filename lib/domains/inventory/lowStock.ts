/**
 * Par alerts for catalog-active, non-manufactured levels (the stock-level query).
 * Below par and out of stock are separate. Forecast suggestions are a third set:
 * still in stock, not below par, and flagged by the buy-list forecast.
 */

export type ParStockRow = {
  onHand: number;
  parUnits: number;
  forecastDriven?: boolean;
};

/** Shelf still has units and is strictly under par. At-par is not below par. */
export function isBelowPar(row: { onHand: number; parUnits: number }): boolean {
  return row.onHand > 0 && row.onHand < row.parUnits;
}

export function belowParSkus<T extends { onHand: number; parUnits: number }>(levels: T[]): T[] {
  return levels.filter(isBelowPar);
}

/** Empty shelf, including zero and negative on-hand. Same level list as below par. */
export function outOfStockSkus<T extends { onHand: number }>(levels: T[]): T[] {
  return levels.filter((row) => row.onHand <= 0);
}

/** Forecast want that is not already below par or out of stock. */
export function forecastSuggestedSkus<T extends ParStockRow>(levels: T[]): T[] {
  return levels.filter((row) => Boolean(row.forecastDriven) && row.onHand > 0 && !isBelowPar(row));
}

export function stockAlertCounts<T extends ParStockRow>(levels: T[]): {
  belowPar: number;
  outOfStock: number;
  forecastSuggested: number;
} {
  return {
    belowPar: belowParSkus(levels).length,
    outOfStock: outOfStockSkus(levels).length,
    forecastSuggested: forecastSuggestedSkus(levels).length,
  };
}
