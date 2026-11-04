export const RETAIL_UNITS = ['units', 'quarts', 'lbs'] as const;

export type RetailUnit = (typeof RETAIL_UNITS)[number];

export type MarginMode = '35' | '40' | 'custom';

export interface ReceivingLog {
  id: string;
  itemName: string;
  casesReceived: number;
  caseCost: number;
  packSize?: number;
  retailUnit?: RetailUnit;
  /** When invoice OCR matched the catalog, receive posts to this SKU. */
  productId?: string;
  /** Original vendor wording (for display). */
  invoiceLineName?: string;
  /** When OCR reads a printed case shelf / list price on the invoice. */
  suggestedCaseFloorPrice?: number;
}

export interface YieldQuote {
  totalRetailUnits: number | null;
  unitCost: number | null;
  targetMargin: number;
  targetSrp: number | null;
  currentMarginPct: number | null;
}

export interface YieldQuoteInput {
  caseCost: number;
  packSize: number;
  yieldDivisor: number;
  targetMargin: number;
  currentRetailPrice: number;
}

export function resolveTargetMargin(mode: MarginMode, customPercent: number): number {
  if (mode === '35') return 0.35;
  if (mode === '40') return 0.4;
  const bounded = Math.min(99, Math.max(0, customPercent));
  return bounded / 100;
}

/** Shelf floor price from unit cost and target margin: cost / (1 − margin). */
export function sellableUnitShortLabel(unit: RetailUnit): string {
  if (unit === 'lbs') return 'lb';
  if (unit === 'quarts') return 'quart';
  return 'unit';
}

export function sellableUnitsPerCase(packSize: number, yieldDivisor: number): number {
  if (!(packSize > 0) || !(yieldDivisor > 0)) return 0;
  return packSize / yieldDivisor;
}

export function perUnitFloorFromCaseFloor(
  caseFloorPrice: number,
  packSize: number,
  yieldDivisor: number
): number | null {
  const sellable = sellableUnitsPerCase(packSize, yieldDivisor);
  if (!(caseFloorPrice > 0) || !(sellable > 0)) return null;
  return Number((caseFloorPrice / sellable).toFixed(4));
}

export function caseFloorFromPerUnitFloor(
  perUnitFloor: number,
  packSize: number,
  yieldDivisor: number
): number | null {
  const sellable = sellableUnitsPerCase(packSize, yieldDivisor);
  if (!(perUnitFloor > 0) || !(sellable > 0)) return null;
  return Number((perUnitFloor * sellable).toFixed(2));
}

/** Unit cost = case cost ÷ sellable units (pack ÷ yield). */
export function unitCostFromCaseCost(
  caseCost: number,
  packSize: number,
  yieldDivisor: number
): number {
  const sellable = sellableUnitsPerCase(packSize, yieldDivisor);
  if (!(caseCost >= 0) || !(sellable > 0)) return 0;
  return Number((caseCost / sellable).toFixed(4));
}

const MIN_PLAUSIBLE_UNIT_COST = 0.15;

/**
 * Catalog `standardCost` is usually per sellable unit; legacy rows sometimes store whole case cost.
 * Always derive: unit cost = case cost ÷ (pack ÷ yield).
 */
export function resolvePricingEconomics(input: {
  standardCost: number;
  packSize: number;
  yieldDivisor: number;
}): { caseCost: number; unitCostPerSellable: number } {
  const sellable = sellableUnitsPerCase(input.packSize, input.yieldDivisor);
  const sc = input.standardCost;
  if (!(sc > 0) || !(sellable > 0)) {
    return { caseCost: 0, unitCostPerSellable: 0 };
  }

  const unitIfStoredIsCaseCost = sc / sellable;
  const caseIfStoredIsUnitCost = sc * sellable;

  if (
    sellable > 1 &&
    unitIfStoredIsCaseCost >= MIN_PLAUSIBLE_UNIT_COST &&
    unitIfStoredIsCaseCost < sc &&
    caseIfStoredIsUnitCost > sc * 2
  ) {
    return {
      caseCost: Number(sc.toFixed(4)),
      unitCostPerSellable: unitIfStoredIsCaseCost,
    };
  }

  return {
    caseCost: Number(caseIfStoredIsUnitCost.toFixed(4)),
    unitCostPerSellable: Number(sc.toFixed(4)),
  };
}

export function totalCaseCostFromYield(input: {
  unitCostPerSellable: number;
  packSize: number;
  yieldDivisor: number;
}): number {
  if (!(input.unitCostPerSellable > 0) || !(input.packSize > 0) || !(input.yieldDivisor > 0)) {
    return 0;
  }
  return input.unitCostPerSellable * sellableUnitsPerCase(input.packSize, input.yieldDivisor);
}

/** Case cost from catalog row + yield fields (prefers resolvePricingEconomics). */
export function caseCostForPricing(input: {
  standardCost: number;
  packSize: number;
  yieldDivisor: number;
}): number {
  return resolvePricingEconomics(input).caseCost;
}

/** Case shelf price from case cost and target margin (catalog column). */
export function caseFloorForTargetMargin(input: {
  caseCost: number;
  marginMode: MarginMode;
  customMarginPercent?: number;
}): number | null {
  const targetMargin = resolveTargetMargin(input.marginMode, input.customMarginPercent ?? 0);
  const room = 1 - targetMargin;
  if (!(input.caseCost >= 0) || room <= 0) return null;
  return Number((input.caseCost / room).toFixed(2));
}

export function marginAtCaseFloorPrice(casePrice: number, caseCost: number): number | null {
  if (!(casePrice > 0) || caseCost < 0) return null;
  return Number((((casePrice - caseCost) / casePrice) * 100).toFixed(2));
}

/** DB `retailPrice` is per yield unit; older rows may have saved case price by mistake. */
export function normalizeStoredUnitFloorPrice(input: {
  retailPrice: number | null;
  unitCostPerSellable: number;
  packSize: number;
  yieldDivisor: number;
}): number | null {
  const raw = input.retailPrice;
  if (raw === null || !(raw > 0)) return null;
  if (!(input.packSize > 0) || !(input.yieldDivisor > 0)) return raw;
  const sellable = input.packSize / input.yieldDivisor;
  const caseCost = caseCostForPricing({
    standardCost: input.unitCostPerSellable,
    packSize: input.packSize,
    yieldDivisor: input.yieldDivisor,
  });
  const caseAt40 = caseCost > 0 ? caseFloorForTargetMargin({ caseCost, marginMode: '40' }) : null;
  if (caseAt40 !== null && Math.abs(raw - caseAt40) < 0.05) {
    return sellable > 0 ? Number((raw / sellable).toFixed(4)) : raw;
  }
  if (sellable > 1 && raw > input.unitCostPerSellable * 4) {
    return Number((raw / sellable).toFixed(4));
  }
  return raw;
}

export function unitFloorForTargetMargin(input: {
  caseCost: number;
  packSize: number;
  yieldDivisor: number;
  marginMode: MarginMode;
  customMarginPercent?: number;
}): number | null {
  return floorPriceForTargetMargin({
    caseCost: input.caseCost,
    packSize: input.packSize,
    yieldDivisor: input.yieldDivisor,
    marginMode: input.marginMode,
    customMarginPercent: input.customMarginPercent ?? 0,
  });
}

export function catalogCaseFloorPrice(input: {
  unitCostPerSellable: number;
  casePackSize: number;
  retailPrice: number | null;
  marginMode?: MarginMode;
}): number | null {
  const pack = input.casePackSize > 0 ? input.casePackSize : 1;
  const econ = resolvePricingEconomics({
    standardCost: input.unitCostPerSellable,
    packSize: pack,
    yieldDivisor: 1,
  });
  const unit = normalizeStoredUnitFloorPrice({
    retailPrice: input.retailPrice,
    unitCostPerSellable: econ.unitCostPerSellable,
    packSize: pack,
    yieldDivisor: 1,
  });
  if (unit !== null && unit > 0) return Number((unit * pack).toFixed(2));
  const caseCost = econ.caseCost;
  if (!(caseCost > 0)) return null;
  return caseFloorForTargetMargin({
    caseCost,
    marginMode: input.marginMode ?? '40',
  });
}

/** Guess 35% / 40% / custom from stored per-unit floor price. */
export function inferMarginModeFromFloorPrice(input: {
  unitCostPerSellable: number;
  retailPrice: number | null;
  packSize: number;
  yieldDivisor: number;
}): MarginMode {
  const econ = resolvePricingEconomics({
    standardCost: input.unitCostPerSellable,
    packSize: input.packSize,
    yieldDivisor: input.yieldDivisor,
  });
  const unitPrice =
    normalizeStoredUnitFloorPrice({
      ...input,
      unitCostPerSellable: econ.unitCostPerSellable,
    }) ?? input.retailPrice ?? 0;
  if (!(econ.unitCostPerSellable > 0) || !(unitPrice > 0)) return '40';
  const caseCost = econ.caseCost;
  if (!(caseCost > 0)) return '40';
  const at35 = unitFloorForTargetMargin({
    caseCost,
    packSize: input.packSize,
    yieldDivisor: input.yieldDivisor,
    marginMode: '35',
  });
  const at40 = unitFloorForTargetMargin({
    caseCost,
    packSize: input.packSize,
    yieldDivisor: input.yieldDivisor,
    marginMode: '40',
  });
  if (at35 !== null && Math.abs(unitPrice - at35) < 0.02) return '35';
  if (at40 !== null && Math.abs(unitPrice - at40) < 0.02) return '40';
  return 'custom';
}

export function floorPriceForTargetMargin(input: {
  caseCost: number;
  packSize: number;
  yieldDivisor: number;
  marginMode: MarginMode;
  customMarginPercent: number;
}): number | null {
  const targetMargin = resolveTargetMargin(input.marginMode, input.customMarginPercent);
  const quote = calculateYieldQuote({
    caseCost: input.caseCost,
    packSize: input.packSize,
    yieldDivisor: input.yieldDivisor,
    targetMargin,
    currentRetailPrice: 0,
  });
  return quote.targetSrp;
}

/**
 * Retail Yield: Total Retail Units = Pack Size / Yield Divisor
 * Unit Cost: Unit Cost = caseCost / Total Retail Units
 * Target SRP: Target SRP = Unit Cost / (1 - Target Margin)
 * Current Margin % = ((Current Retail Price - Unit Cost) / Current Retail Price) * 100
 */
export function calculateYieldQuote(input: YieldQuoteInput): YieldQuote {
  const { caseCost, packSize, yieldDivisor, targetMargin, currentRetailPrice } = input;

  const totalRetailUnits =
    packSize > 0 && yieldDivisor > 0 ? packSize / yieldDivisor : null;

  const unitCost =
    totalRetailUnits !== null && totalRetailUnits > 0 && caseCost >= 0
      ? caseCost / totalRetailUnits
      : null;

  const marginRoom = 1 - targetMargin;
  const targetSrp =
    unitCost !== null && marginRoom > 0 ? unitCost / marginRoom : null;

  const currentMarginPct =
    unitCost !== null && currentRetailPrice > 0
      ? ((currentRetailPrice - unitCost) / currentRetailPrice) * 100
      : null;

  return {
    totalRetailUnits,
    unitCost,
    targetMargin,
    targetSrp,
    currentMarginPct,
  };
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '$0.00';
  return `$${value.toFixed(2)}`;
}

export function formatUnits(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0';
  const rounded = Number(value.toFixed(2));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function gcdInt(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y > 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/** Human-readable case count when on-hand is often a partial case (e.g. 8 of 12 units → "2/3 case"). */
export function formatFractionalCases(
  unitsOnHand: number,
  unitsPerCase: number
): { primary: string; decimal: string; detail: string } {
  const pack = unitsPerCase > 0 ? unitsPerCase : 1;
  const units = Math.max(0, Number(unitsOnHand.toFixed(4)));
  const casesDec = Number((units / pack).toFixed(4));
  const decimal = formatUnits(casesDec);

  const wholeCases = Math.floor(units / pack + 1e-9);
  let remainder = Number((units - wholeCases * pack).toFixed(4));
  if (remainder < 0.0001) remainder = 0;

  const packInt = Math.max(1, Math.round(pack));
  const remInt = Math.max(0, Math.round(remainder));
  const [num, den] =
    remInt === 0 ? [0, 1] : (() => {
      const g = gcdInt(remInt, packInt);
      return [remInt / g, packInt / g];
    })();

  const frac =
    remInt === 0 ? '' : den === 1 ? String(num) : `${num}/${den}`;

  let primary: string;
  if (wholeCases > 0 && remInt === 0) {
    primary = wholeCases === 1 ? '1 case' : `${wholeCases} cases`;
  } else if (wholeCases > 0 && frac) {
    primary = `${wholeCases} + ${frac} cases`;
  } else if (frac && remInt > 0) {
    primary = den === 1 ? `${frac} cases` : `${frac} case`;
  } else {
    primary = `${decimal} cases`;
  }

  const detail =
    remInt === 0 && wholeCases > 0
      ? `${formatUnits(units)} sellable units`
      : `${formatUnits(units)} of ${formatUnits(pack)} units per case`;

  return { primary, decimal, detail };
}

const STOCK_UNIT_LABELS: Record<string, string> = {
  LBS: 'lbs',
  KG: 'kg',
  LITER: 'L',
  ML: 'ml',
  UNIT: 'units',
  BUNCH: 'bunches',
  LOAF: 'loaves',
  TUB: 'tubs',
  CASE: 'cases',
};

export function stockUnitLabel(unitType: string): string {
  return STOCK_UNIT_LABELS[unitType] ?? 'units';
}

/** Maps catalog `UnitType` to yield / pack unit selectors in receiving UI. */
export function retailUnitForUnitType(unitType: string): RetailUnit {
  if (unitType === 'LBS' || unitType === 'KG') return 'lbs';
  if (unitType === 'LITER' || unitType === 'ML') return 'quarts';
  return 'units';
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
}

export function marginTone(currentMarginPct: number | null): 'healthy' | 'thin' | 'empty' {
  if (currentMarginPct === null || !Number.isFinite(currentMarginPct)) return 'empty';
  return currentMarginPct >= 35 ? 'healthy' : 'thin';
}

export function suggestPackDefaults(itemName: string): {
  packSize: string;
  yieldDivisor: string;
  retailUnit: RetailUnit;
} {
  const name = itemName.toLowerCase();
  if (name.includes('avocado')) {
    return { packSize: '36', yieldDivisor: '1', retailUnit: 'units' };
  }
  if (name.includes('tomato')) {
    return { packSize: '16', yieldDivisor: '1', retailUnit: 'lbs' };
  }
  if (name.includes('apple') || name.includes('honeycrisp')) {
    return { packSize: '40', yieldDivisor: '1', retailUnit: 'lbs' };
  }
  if (name.includes('strawberr')) {
    return { packSize: '8', yieldDivisor: '1', retailUnit: 'quarts' };
  }
  if (name.includes('blueberr')) {
    return { packSize: '12', yieldDivisor: '1', retailUnit: 'units' };
  }
  return { packSize: '12', yieldDivisor: '1', retailUnit: 'units' };
}
