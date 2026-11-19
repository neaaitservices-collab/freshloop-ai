/**
 * Header total for a scanned invoice.
 * A printed subtotal wins. When the page did not print one, the total is the sum of the lines.
 * Tax stays on its own fields and is not added here.
 */
export function selectInvoiceHeaderTotal(input: {
  printedSubtotal?: number | null;
  lineAmounts?: Array<number | null | undefined>;
}): number {
  const printed = input.printedSubtotal;
  if (typeof printed === 'number' && Number.isFinite(printed) && printed > 0) {
    return Number(printed.toFixed(2));
  }
  const sum = (input.lineAmounts ?? []).reduce<number>((total, amount) => {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) return total;
    return total + amount;
  }, 0);
  return Number(sum.toFixed(2));
}
