/** Currency helpers — store/display as dollars; compute in integer cents to reduce drift. */

export function toCents(dollars: number): number {
  if (!Number.isFinite(dollars)) return 0;
  return Math.round(dollars * 100);
}

export function fromCents(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return Number((cents / 100).toFixed(2));
}

export function multiplyMoney(unitPriceDollars: number, quantity: number): number {
  const cents = Math.round(toCents(unitPriceDollars) * quantity);
  return fromCents(cents);
}

export function markdownRevenueImpact(
  quantityUnits: number,
  regularPrice: number,
  markdownPrice: number
): number {
  const perUnitCents = Math.max(0, toCents(regularPrice) - toCents(markdownPrice));
  return fromCents(Math.round(perUnitCents * quantityUnits));
}
