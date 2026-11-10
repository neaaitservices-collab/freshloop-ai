/**
 * Par alerts for catalog-active, non-manufactured levels (the stock-level query).
 * Below par, out of stock, and forecast suggestions do not overlap.
 *
 * Out of stock uses `hasStockHistory`: true when the stock query's existing
 * `LEFT JOIN Inventory_Transactions` sees at least one ledger row (`COUNT(t.id) > 0`
 * in that same GROUP BY). A never-received SKU stays out of the count. Lots are
 * not consulted; a consumed lot can disappear while the ledger row remains.
 */

export type ParStockRow = {
  onHand: number;
  parUnits: number;
  /** True when this SKU has ever had an inventory ledger row. */
  hasStockHistory?: boolean;
  low?: boolean;
  forecastDriven?: boolean;
};

/** Shelf still has units and is strictly under par. At-par is not below par. */
export function isBelowPar(row: { onHand: number; parUnits: number }): boolean {
  return row.onHand > 0 && row.onHand < row.parUnits;
}

export function belowParSkus<T extends { onHand: number; parUnits: number }>(levels: T[]): T[] {
  return levels.filter(isBelowPar);
}

export function isOutOfStock(row: { onHand: number; hasStockHistory?: boolean }): boolean {
  return row.onHand <= 0 && row.hasStockHistory === true;
}

/** Empty shelf that has been stocked before. Never-received catalog rows are excluded. */
export function outOfStockSkus<T extends { onHand: number; hasStockHistory?: boolean }>(levels: T[]): T[] {
  return levels.filter(isOutOfStock);
}

/**
 * Forecast lines the orders list shows: `low && forecastDriven`, excluding rows
 * already counted as below par or out of stock. `forecastDriven && !low` is omitted.
 */
export function forecastSuggestedSkus<T extends ParStockRow>(levels: T[]): T[] {
  return levels.filter(
    (row) => Boolean(row.low) && Boolean(row.forecastDriven) && !isBelowPar(row) && !isOutOfStock(row)
  );
}

/** Same rows as `forecastSuggestedSkus`, with an optional hide (sent lines). */
export function listedForecastLines<T extends ParStockRow>(
  levels: T[],
  isHidden?: (row: T) => boolean
): T[] {
  return forecastSuggestedSkus(levels).filter((row) => !isHidden?.(row));
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
