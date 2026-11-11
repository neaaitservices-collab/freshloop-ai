/**
 * Cards for the Recent deliveries swipe strip.
 * The strip is the invoice currently scanned or open. Posted history stays in the
 * source list and is not removed here.
 */
export function recentDeliveryStripItems<
  T extends { id: string; invoiceNumber?: string | null },
>(logs: readonly T[], activeInvoiceIds: ReadonlySet<string>): T[] {
  if (activeInvoiceIds.size === 0) return [];

  const invoiceNumbers = new Set<string>();
  for (const log of logs) {
    if (!activeInvoiceIds.has(log.id)) continue;
    const invoiceNumber = log.invoiceNumber?.trim();
    if (invoiceNumber) invoiceNumbers.add(invoiceNumber);
  }

  return logs.filter((log) => {
    if (activeInvoiceIds.has(log.id)) return true;
    const invoiceNumber = log.invoiceNumber?.trim();
    return Boolean(invoiceNumber && invoiceNumbers.has(invoiceNumber));
  });
}
