import {
  perUnitFloorFromCaseFloor,
  sellableUnitsPerCase,
  unitFloorPriceForMarginPreset,
  type MarginMode,
} from '@/lib/domains/receiving/yieldPricing';

/** Parse currency input; empty → null, invalid → null. */
export function parseCatalogPriceInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function sellableCountForPack(packSize: number, splitFactor: number): number | null {
  const sellable = sellableUnitsPerCase(packSize, splitFactor);
  return sellable > 0 ? sellable : null;
}

/**
 * Unit shelf $ from case shelf $.
 * Unit = case price ÷ sellable units per case (pack size ÷ split factor).
 */
export function formatUnitPriceFromCase(
  casePrice: number,
  packSize: number,
  splitFactor: number
): string {
  const unitVal = perUnitFloorFromCaseFloor(casePrice, packSize, splitFactor);
  if (unitVal === null || !(unitVal > 0)) return '';
  return unitVal.toFixed(2);
}

/** Gross margin %: ((price − unitCost) / price) × 100. */
export function grossMarginPercent(floorPrice: number, unitCost: number): number | null {
  if (!(floorPrice > 0) || unitCost < 0) return null;
  return Number((((floorPrice - unitCost) / floorPrice) * 100).toFixed(2));
}

export function presetUnitFloorPrice(unitCost: number, mode: '35' | '40'): number | null {
  return unitFloorPriceForMarginPreset(unitCost, mode);
}

/** Margin presets set unit floor only — case price is never overwritten. */
export function applyPresetMarginToUnitPrice(input: {
  mode: Exclude<MarginMode, 'custom'>;
  unitCost: number;
}): string | null {
  if (input.mode !== '35' && input.mode !== '40') return null;
  if (!(input.unitCost >= 0)) return null;
  const perUnit = unitFloorPriceForMarginPreset(input.unitCost, input.mode);
  if (perUnit === null || !(perUnit > 0)) return null;
  return perUnit.toFixed(2);
}
