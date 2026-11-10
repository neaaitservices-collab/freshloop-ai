export interface InboxReceipt {
  productId: string;
  qtyReceived: number;
  lastReceivedAt: string;
  staffName?: string;
}

/**
 * One row per product. Quantities add. The newest transfer keeps the time and sender.
 * Input order does not matter.
 */
export function sumInboxByProduct<T extends InboxReceipt>(rows: readonly T[]): T[] {
  const totals = new Map<string, T>();
  for (const row of rows) {
    const existing = totals.get(row.productId);
    if (!existing) {
      totals.set(row.productId, { ...row });
      continue;
    }
    const existingIsNewer = existing.lastReceivedAt >= row.lastReceivedAt;
    totals.set(row.productId, {
      ...existing,
      qtyReceived: Number((existing.qtyReceived + row.qtyReceived).toFixed(2)),
      lastReceivedAt: existingIsNewer ? existing.lastReceivedAt : row.lastReceivedAt,
      staffName: existingIsNewer ? existing.staffName : row.staffName,
    });
  }
  return [...totals.values()];
}
