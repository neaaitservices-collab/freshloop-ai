'use client';

import React from 'react';
import type { RetailUnit } from '@/lib/domains/receiving/yieldPricing';
import { CurrencyField, NumberField, UnitSelect } from '@/components/ui/YieldFields';

/** Catalog: Pack | Unit | Case price on row 1; Split | Into (+ unit price) below. */
export const YIELD_PACK_GRID_CLASS =
  'grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(5.75rem,7.25rem)_minmax(0,1fr)] sm:gap-x-3 sm:gap-y-4';

/** Receive: Pack · Unit · Split · Into — one aligned row on tablet+, 2×2 on phone. */
export const YIELD_PACK_FOUR_FIELD_GRID_CLASS =
  'grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-3 sm:items-end';

const DEFAULT_IDS = {
  packSize: 'pack-size',
  packUnit: 'pack-unit',
  caseFloor: 'case-floor-price',
  unitFloor: 'unit-floor-price',
  splitFactor: 'split-factor',
  yieldInto: 'yield-into-unit',
} as const;

export function YieldPackInputs({
  packSize,
  splitFactor,
  packUnit,
  yieldUnit,
  onPackSize,
  onSplitFactor,
  onPackUnit,
  onYieldUnit,
  caseFloorPrice,
  onCaseFloorPrice,
  unitFloorPrice,
  onUnitFloorPrice,
  caseFloorReadOnly = false,
  unitFloorReadOnly = false,
  showCaseFloor = true,
  ids = DEFAULT_IDS,
}: {
  packSize: string;
  splitFactor: string;
  packUnit: RetailUnit;
  yieldUnit: RetailUnit;
  onPackSize: (value: string) => void;
  onSplitFactor: (value: string) => void;
  onPackUnit: (value: RetailUnit) => void;
  onYieldUnit: (value: RetailUnit) => void;
  caseFloorPrice?: string;
  onCaseFloorPrice?: (value: string) => void;
  unitFloorPrice?: string;
  onUnitFloorPrice?: (value: string) => void;
  caseFloorReadOnly?: boolean;
  unitFloorReadOnly?: boolean;
  showCaseFloor?: boolean;
  ids?: Partial<Record<keyof typeof DEFAULT_IDS, string>>;
}) {
  const fieldIds = { ...DEFAULT_IDS, ...ids };
  const caseValue = caseFloorPrice ?? '';
  const unitValue = unitFloorPrice ?? '';
  const dualPrice = onUnitFloorPrice != null;
  const caseLabel = dualPrice ? 'Case price ($)' : 'Floor price';
  const fourFieldLayout = !showCaseFloor && !dualPrice;
  const fieldShell = 'block min-w-0 space-y-1.5';

  if (fourFieldLayout) {
    return (
      <div className={YIELD_PACK_FOUR_FIELD_GRID_CLASS}>
        <NumberField
          id={fieldIds.packSize}
          label="Pack size"
          value={packSize}
          onChange={onPackSize}
          className={fieldShell}
        />
        <UnitSelect
          id={fieldIds.packUnit}
          label="Unit"
          aria-label="Pack size unit"
          value={packUnit}
          onChange={onPackUnit}
        />
        <NumberField
          id={fieldIds.splitFactor}
          label="Split factor"
          value={splitFactor}
          onChange={onSplitFactor}
          step="0.001"
          className={fieldShell}
        />
        <UnitSelect
          id={fieldIds.yieldInto}
          label="Into"
          aria-label="Split factor unit"
          value={yieldUnit}
          onChange={onYieldUnit}
        />
      </div>
    );
  }

  return (
    <div className={YIELD_PACK_GRID_CLASS}>
      <NumberField
        id={fieldIds.packSize}
        label="Pack size"
        value={packSize}
        onChange={onPackSize}
        className={fieldShell}
      />
      <UnitSelect
        id={fieldIds.packUnit}
        label="Unit"
        aria-label="Pack size unit"
        value={packUnit}
        onChange={onPackUnit}
      />
      {showCaseFloor ? (
        <CurrencyField
          id={fieldIds.caseFloor}
          label={caseLabel}
          value={caseValue}
          onChange={onCaseFloorPrice ?? (() => {})}
          readOnly={caseFloorReadOnly || !onCaseFloorPrice}
        />
      ) : null}

      <NumberField
        id={fieldIds.splitFactor}
        label="Split factor"
        value={splitFactor}
        onChange={onSplitFactor}
        step="0.001"
        className={fieldShell}
      />
      <UnitSelect
        id={fieldIds.yieldInto}
        label="Into"
        aria-label="Split factor unit"
        value={yieldUnit}
        onChange={onYieldUnit}
      />
      {dualPrice ? (
        <CurrencyField
          id={fieldIds.unitFloor}
          label="Unit price ($)"
          value={unitValue}
          onChange={onUnitFloorPrice}
          readOnly={unitFloorReadOnly}
        />
      ) : null}
    </div>
  );
}
