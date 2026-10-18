export type MeasurementUnit = 
  | 'lbs' 
  | 'oz' 
  | 'g' 
  | 'kg' 
  | 'ml' 
  | 'L' 
  | 'fl oz' 
  | 'units' 
  | 'cases' 
  | 'packs' 
  | 'crates' 
  | 'bunches' 
  | 'loaves' 
  | 'tubs' 
  | 'boxes' 
  | 'jars' 
  | 'cans' 
  | 'jugs';

export interface UnitOption {
  value: MeasurementUnit;
  label: string;
  category: 'Weight / Mass' | 'Volume / Liquid' | 'Containers & Units';
}


export const SUPPORTED_UNITS: UnitOption[] = [
  // Mass & Weight
  { value: 'lbs', label: 'lbs (Pounds)', category: 'Weight / Mass' },
  { value: 'oz', label: 'oz (Ounces)', category: 'Weight / Mass' },
  { value: 'kg', label: 'kg (Kilograms)', category: 'Weight / Mass' },
  { value: 'g', label: 'g (Grams)', category: 'Weight / Mass' },

  // Volume
  { value: 'L', label: 'L (Liters)', category: 'Volume / Liquid' },
  { value: 'ml', label: 'ml (Milliliters)', category: 'Volume / Liquid' },
  { value: 'fl oz', label: 'fl oz (Fluid Ounces)', category: 'Volume / Liquid' },

  // Count / Discrete
  { value: 'units', label: 'units (Individual)', category: 'Containers & Units' },
  { value: 'cases', label: 'cases (Case Lot)', category: 'Containers & Units' },
  { value: 'packs', label: 'packs (Package)', category: 'Containers & Units' },
  { value: 'crates', label: 'crates (Wood Crate)', category: 'Containers & Units' },
  { value: 'bunches', label: 'bunches (Produce Bunch)', category: 'Containers & Units' },
  { value: 'loaves', label: 'loaves (Bakery Loaf)', category: 'Containers & Units' },
  { value: 'tubs', label: 'tubs (Deli Tub)', category: 'Containers & Units' },
  { value: 'boxes', label: 'boxes (Box)', category: 'Containers & Units' },
  { value: 'jars', label: 'jars (Glass Jar)', category: 'Containers & Units' },
  { value: 'cans', label: 'cans (Tin Can)', category: 'Containers & Units' },
  { value: 'jugs', label: 'jugs (Liquid Jug)', category: 'Containers & Units' },
];

/**
 * Standard unit conversion factors to base units (lbs for mass, L for volume)
 */
const MASS_TO_LBS: Record<string, number> = {
  lbs: 1,
  oz: 0.0625,
  kg: 2.20462,
  g: 0.00220462,
};

const VOL_TO_LITERS: Record<string, number> = {
  L: 1,
  ml: 0.001,
  'fl oz': 0.0295735,
};

/**
 * Convert quantity and unit price between measurement units
 */
export function convertUnitValue(
  quantity: number,
  unitCost: number,
  fromUnit: string,
  toUnit: string
): { newQuantity: number; newUnitCost: number } {
  if (fromUnit === toUnit) return { newQuantity: quantity, newUnitCost: unitCost };

  // Total cost remains constant during unit conversion
  const totalCost = quantity * unitCost;

  // Mass conversion
  if (MASS_TO_LBS[fromUnit] && MASS_TO_LBS[toUnit]) {
    const totalLbs = quantity * MASS_TO_LBS[fromUnit];
    const newQuantity = totalLbs / MASS_TO_LBS[toUnit];
    const newUnitCost = totalCost / newQuantity;
    return {
      newQuantity: Number(newQuantity.toFixed(2)),
      newUnitCost: Number(newUnitCost.toFixed(2))
    };
  }

  // Volume conversion
  if (VOL_TO_LITERS[fromUnit] && VOL_TO_LITERS[toUnit]) {
    const totalLiters = quantity * VOL_TO_LITERS[fromUnit];
    const newQuantity = totalLiters / VOL_TO_LITERS[toUnit];
    const newUnitCost = totalCost / newQuantity;
    return {
      newQuantity: Number(newQuantity.toFixed(2)),
      newUnitCost: Number(newUnitCost.toFixed(2))
    };
  }

  // Fallback for count units
  return { newQuantity: quantity, newUnitCost: unitCost };
}

export const STANDARD_RECEIVED_UNITS = [
  'Case',
  'Box',
  'Crate',
  'Flat',
  'Bag',
  'Lug',
  'Bin',
  'Carton',
  'Pack',
  'bunches',
  'lbs',
  'units'
];

export const STANDARD_RETAIL_UNITS = [
  { value: 'quarts', label: 'quarts (Quart)' },
  { value: 'pints', label: 'pints (Pint)' },
  { value: 'ea', label: 'ea (Each)' },
  { value: 'lbs', label: 'lbs (Pounds)' },
  { value: 'bunches', label: 'bunches (Bunch)' },
  { value: 'units', label: 'units (Individual Count)' },
  { value: 'oz', label: 'oz (Ounces)' },
  { value: 'tubs', label: 'tubs (Deli Tub)' },
  { value: 'bags', label: 'bags (Retail Bag)' },
  { value: 'kg', label: 'kg (Kilograms)' },
  { value: 'g', label: 'g (Grams)' },
  { value: 'loaves', label: 'loaves (Loaf)' },
  { value: 'L', label: 'L (Liters)' },
  { value: 'ml', label: 'ml (Milliliters)' },
];

/**
 * Calculates complete unit pricing, case pack totals, and sub-unit breakdowns
 * e.g. 5 Cases @ 40 lb/case = 200 lbs ($1.00/lb) or $40.00/case
 */
export function calculateCaseUnitValues(
  caseQuantity: number,
  costPerCase: number,
  casePackSize: number = 40,
  subUnit: string = 'lbs',
  targetUnit: string = 'cases',
  receivedUnit: string = 'Case'
): {
  displayQuantity: number;
  displayUnitCost: number;
  displayUnit: string;
  caseQuantity: number;
  caseCost: number;
  totalCost: number;
  totalSubUnits: number;
  subUnitCost: number;
  packDescription: string;
  divisionFormula: string;
  receivedUnit: string;
} {
  const safePackSize = casePackSize > 0 ? casePackSize : 1;
  const safeCaseQuantity = caseQuantity > 0 ? caseQuantity : 1;
  const totalCost = safeCaseQuantity * costPerCase;
  const totalSubUnits = safeCaseQuantity * safePackSize;
  const baseSubUnitCost = costPerCase / safePackSize;
  const packDescription = `1 ${receivedUnit} = ${safePackSize} ${subUnit}`;
  const divisionFormula = `$${costPerCase.toFixed(2)}/${receivedUnit} ÷ ${safePackSize} ${subUnit} = $${baseSubUnitCost.toFixed(2)}/${subUnit}`;

  if (targetUnit === 'cases' || targetUnit === 'crates' || targetUnit === 'boxes' || targetUnit.toLowerCase() === receivedUnit.toLowerCase()) {
    return {
      displayQuantity: safeCaseQuantity,
      displayUnitCost: Number(costPerCase.toFixed(2)),
      displayUnit: receivedUnit,
      caseQuantity: safeCaseQuantity,
      caseCost: Number(costPerCase.toFixed(2)),
      totalCost: Number(totalCost.toFixed(2)),
      totalSubUnits,
      subUnitCost: Number(baseSubUnitCost.toFixed(2)),
      packDescription,
      divisionFormula,
      receivedUnit
    };
  }

  // Convert sub-unit value to targetUnit (e.g. lbs to oz, kg, g)
  const { newQuantity, newUnitCost } = convertUnitValue(
    totalSubUnits,
    baseSubUnitCost,
    subUnit,
    targetUnit
  );

  return {
    displayQuantity: newQuantity,
    displayUnitCost: newUnitCost,
    displayUnit: targetUnit,
    caseQuantity: safeCaseQuantity,
    caseCost: Number(costPerCase.toFixed(2)),
    totalCost: Number(totalCost.toFixed(2)),
    totalSubUnits,
    subUnitCost: Number(baseSubUnitCost.toFixed(2)),
    packDescription,
    divisionFormula,
    receivedUnit
  };
}

/**
 * Calculates Suggested Retail Price (SRP) based on Target Gross Margin formula:
 * Retail Price = Unit Cost / (1 - Margin %)
 * - 30% Margin: Unit Cost / 0.70
 * - 35% Margin: Unit Cost / 0.65
 * - 40% Margin: Unit Cost / 0.60
 * - 45% Margin: Unit Cost / 0.55
 * - 50% Margin: Unit Cost / 0.50
 */
export function calculateRetailPriceByMargin(
  unitCost: number,
  targetMarginPct: number = 35
): {
  retailPrice: number;
  divisor: number;
  grossProfit: number;
  formulaText: string;
} {
  const safeMargin = Math.min(99, Math.max(1, targetMarginPct));
  const divisor = (100 - safeMargin) / 100;
  const retailPrice = unitCost / (divisor || 0.65);
  const grossProfit = retailPrice - unitCost;
  const formulaText = `$${unitCost.toFixed(2)} / ${divisor.toFixed(2)} = $${retailPrice.toFixed(2)} (${safeMargin}% Margin)`;

  return {
    retailPrice: Number(retailPrice.toFixed(2)),
    divisor: Number(divisor.toFixed(2)),
    grossProfit: Number(grossProfit.toFixed(2)),
    formulaText
  };
}
