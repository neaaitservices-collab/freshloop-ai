import { multiplyMoney, toCents, fromCents } from '@/lib/utils/money';

/**
 * Historical sale revenue.
 *
 * Trustworthy history is revenue written onto the ledger row at sale time
 * (`realizedLineRevenue`). Historical waste and sales metrics use that stored
 * number. Changing `products.retailPrice` later must not revalue the row.
 *
 * Legacy policy (rows whose original price cannot be recovered):
 * - `realizedLineRevenue IS NULL`, or a non-finite / negative value, is unknown.
 * - Unknown lines are excluded from the gross-sales denominator and counted
 *   separately (`legacyUnpricedSaleCount` / `legacyUnpricedSaleUnits`).
 * - Do not substitute the current shelf price, `regularRetailPrice`,
 *   `MarkdownEvent.revenueImpact`, note text, or `unitCostAtTime`.
 * - `unitCostAtTime` is moving-average cost on `POS_Sale` rows and on waste,
 *   rescue, and receive rows. Some older `Sale` rows stored a shelf price in
 *   that cost column, but the column is not a reliable price source.
 *
 * What this does not do:
 * - Physical waste stays `|qty| * unitCostAtTime` (plus volumetric scrap).
 *   Markdown loss stays on `markdown_events.revenue_impact` and is not waste
 *   and is not subtracted from historical sales.
 * - Refunds and returns are not a ledger type. Only negative `Sale` and
 *   `POS_Sale` quantities are outflows. A positive quantity is ignored, not
 *   treated as a return and not counted as a legacy gap.
 * - A recorded `0` is a known zero (no shelf price and no cost fallback, or a
 *   zero bundle total). It is included as $0 and is not legacy-unknown.
 * - Money uses the existing cent helper (`multiplyMoney` / `toCents`). This is
 *   not a Decimal migration. Bundle totals keep
 *   `Number((bundlePrice * quantitySold).toFixed(2))` when that value is
 *   finite and non-negative; a negative or non-finite bundle total is recorded
 *   as $0 on the lines (unsupported price) while callers may still see the
 *   raw figure on the bundle execution result.
 * - Bundle line revenue is allocated once, in cents, so the parts sum to the
 *   bundle total. Weights are shelf price at sale time, otherwise standard
 *   cost, times quantity. If every component lacks a price and a cost, the
 *   split follows quantity. Later shelf-price edits do not reallocate.
 */

export interface RecordedSalePrice {
  realizedUnitPrice: number;
  realizedLineRevenue: number;
}

export interface ProductSalePriceInput {
  quantity: number;
  unitPriceOverride?: number | null;
  retailPrice?: number | null;
  standardCost?: number | null;
  targetMargin: number;
}

export interface RecognizedSaleLine {
  transactionType: string;
  qtyChange: number;
  realizedLineRevenue: number | null;
  /** Present only so tests can prove the current shelf price is not read. */
  currentRetailPrice?: number | null;
}

export interface RecognizedGrossSales {
  grossSalesRevenue: number;
  legacyUnpricedSaleCount: number;
  legacyUnpricedSaleUnits: number;
}

export interface BundleRevenueComponent {
  qty: number;
  retailPrice?: number | null;
  standardCost?: number | null;
}

function positiveFinite(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) return null;
  return value;
}

/** Same precedence as product sales: POS override, shelf price, then cost / (1 - margin). */
export function resolveProductSaleUnitPrice(input: ProductSalePriceInput): number {
  const override = positiveFinite(input.unitPriceOverride);
  if (override !== null) return override;

  const retail = positiveFinite(input.retailPrice);
  if (retail !== null) return retail;

  const cost = positiveFinite(input.standardCost);
  if (cost === null) return 0;

  const margin =
    typeof input.targetMargin === 'number' && Number.isFinite(input.targetMargin)
      ? input.targetMargin
      : 0;
  const derived = cost / (1 - Math.min(0.95, margin));
  if (!Number.isFinite(derived) || !(derived > 0)) return 0;
  return derived;
}

/** Price snapshot written on a new product `Sale` row. Null is never used for a new write. */
export function priceProductSale(input: ProductSalePriceInput): RecordedSalePrice & {
  unitPrice: number;
  grossRevenue: number;
} {
  const raw = resolveProductSaleUnitPrice(input);
  const unitPrice = Number(raw.toFixed(4));
  const grossRevenue = multiplyMoney(raw, input.quantity);
  return {
    unitPrice,
    grossRevenue,
    realizedUnitPrice: unitPrice,
    realizedLineRevenue: grossRevenue,
  };
}

/** Bundle catalog total, matching the historical execution formula. */
export function bundleCatalogGrossRevenue(bundlePrice: number, quantitySold: number): number {
  const raw = Number((bundlePrice * quantitySold).toFixed(2));
  return Number.isFinite(raw) ? raw : 0;
}

function allocateCents(totalCents: number, weights: number[]): number[] {
  const count = weights.length;
  if (count === 0) return [];
  if (!(totalCents > 0)) return weights.map(() => 0);

  const safe = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0));
  let basis = safe;
  let basisSum = basis.reduce((sum, weight) => sum + weight, 0);
  if (!(basisSum > 0)) {
    basis = weights.map(() => 1);
    basisSum = count;
  }

  const rawShares = basis.map((weight) => (totalCents * weight) / basisSum);
  const floors = rawShares.map((share) => Math.floor(share));
  let remainder = totalCents - floors.reduce((sum, share) => sum + share, 0);
  const ranked = rawShares
    .map((share, index) => ({ index, fraction: share - Math.floor(share) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const row of ranked) {
    if (remainder <= 0) break;
    floors[row.index] += 1;
    remainder -= 1;
  }
  return floors;
}

/**
 * Split a bundle's realized revenue across exploded component lines.
 * Each entry is safe to persist; new rows are never left null.
 */
export function allocateBundleRealizedRevenue(input: {
  bundlePrice: number;
  quantitySold: number;
  components: BundleRevenueComponent[];
}): RecordedSalePrice[] {
  const catalogTotal = bundleCatalogGrossRevenue(input.bundlePrice, input.quantitySold);
  const total = catalogTotal > 0 ? catalogTotal : 0;
  const totalCents = toCents(total);

  const priceWeights = input.components.map((component) => {
    if (!(component.qty > 0)) return 0;
    const price = positiveFinite(component.retailPrice) ?? positiveFinite(component.standardCost);
    return price === null ? 0 : component.qty * price;
  });
  const anyPrice = priceWeights.some((weight) => weight > 0);
  const weights = anyPrice
    ? priceWeights
    : input.components.map((component) => (component.qty > 0 ? component.qty : 0));

  const cents = allocateCents(totalCents, weights);
  return input.components.map((component, index) => {
    const lineRevenue = fromCents(cents[index] ?? 0);
    const unitPrice =
      component.qty > 0 ? Number((lineRevenue / component.qty).toFixed(4)) : 0;
    return {
      realizedUnitPrice: unitPrice,
      realizedLineRevenue: lineRevenue,
    };
  });
}

function isTrustworthyRevenue(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isSaleOutflow(line: RecognizedSaleLine): boolean {
  return (
    (line.transactionType === 'Sale' || line.transactionType === 'POS_Sale') &&
    Number.isFinite(line.qtyChange) &&
    line.qtyChange < 0
  );
}

/** Gross sales for the waste denominator. Ignores any current shelf price on the line. */
export function sumRecognizedGrossSales(lines: RecognizedSaleLine[]): RecognizedGrossSales {
  let cents = 0;
  let legacyUnpricedSaleCount = 0;
  let legacyUnits = 0;

  for (const line of lines) {
    if (!isSaleOutflow(line)) continue;
    if (!isTrustworthyRevenue(line.realizedLineRevenue)) {
      legacyUnpricedSaleCount += 1;
      legacyUnits += Math.abs(line.qtyChange);
      continue;
    }
    cents += toCents(line.realizedLineRevenue);
  }

  return {
    grossSalesRevenue: fromCents(cents),
    legacyUnpricedSaleCount,
    legacyUnpricedSaleUnits: Number(legacyUnits.toFixed(4)),
  };
}

export function legacySaleDisclosure(count: number, units: number): string {
  if (!(count > 0)) return '';
  const unitText = Number(units.toFixed(4)).toString();
  return `${count} legacy sale line(s), ${unitText} units, excluded because the original sale price was not recorded. Current shelf price is not applied.`;
}
