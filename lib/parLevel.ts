export const DEFAULT_PAR_CASES = 2;

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

export function normalizeParCases(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PAR_CASES;
  return Math.max(0, Math.min(999, Math.round(value)));
}

export function stockFromPar(input: {
  onHand: number;
  casePackSize: number;
  unitCost: number;
  parCases: number;
}): {
  parCases: number;
  parUnits: number;
  onHandCases: number;
  low: boolean;
  orderCases: number;
  orderCost: number;
} {
  const casePackSize = input.casePackSize > 0 ? input.casePackSize : 1;
  const parCases = normalizeParCases(input.parCases);
  const onHand = Number(input.onHand.toFixed(2));
  const parUnits = parCases * casePackSize;
  const onHandCases = Number((onHand / casePackSize).toFixed(2));
  const low = onHand < parUnits;
  const orderCases = low ? Math.max(1, Math.ceil((parUnits - onHand) / casePackSize)) : 0;
  const unitCost = input.unitCost > 0 ? input.unitCost : 0;
  return {
    parCases,
    parUnits,
    onHandCases,
    low,
    orderCases,
    orderCost: Number((orderCases * casePackSize * unitCost).toFixed(2)),
  };
}
