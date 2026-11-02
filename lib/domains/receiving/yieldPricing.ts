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
