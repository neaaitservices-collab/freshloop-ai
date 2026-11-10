/** Newest rows returned for a date-range list. Totals use a separate aggregate. */
export const RANGE_ROW_LIMIT = 500;

export function rangeIsTruncated(totalCount: number, limit = RANGE_ROW_LIMIT): boolean {
  return totalCount > limit;
}

export function showingLatestLabel(limit: number): string {
  return `Showing latest ${limit}`;
}
