'use client';

import React from 'react';
import type { RetailUnit } from '@/lib/domains/receiving/yieldPricing';
import { CurrencyField, NumberField, UnitSelect } from '@/components/ui/YieldFields';

/** Shared admin + receive yield/pack row alignment (Pack size | Unit | Case floor · Yield divisor | Into). */
export const YIELD_PACK_GRID_CLASS =
  'grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(5.75rem,7.25rem)_minmax(0,1fr)] sm:gap-x-3 sm:gap-y-4';

const DEFAULT_IDS = {
  packSize: 'pack-size',
  packUnit: 'pack-unit',
  caseFloor: 'case-floor-price',
  yieldDivisor: 'yield-divisor',
  yieldInto: 'yield-into-unit',
} as const;

export function YieldPackInputs({
  packSize,
  yieldDivisor,
  packUnit,
  yieldUnit,
  onPackSize,
  onYieldDivisor,
  onPackUnit,
  onYieldUnit,
  caseFloorPrice,
  onCaseFloorPrice,
  caseFloorReadOnly = false,
  showCaseFloor = true,
  ids = DEFAULT_IDS,
}: {
  packSize: string;
  yieldDivisor: string;
  packUnit: RetailUnit;
  yieldUnit: RetailUnit;
  onPackSize: (value: string) => void;
  onYieldDivisor: (value: string) => void;
  onPackUnit: (value: RetailUnit) => void;
  onYieldUnit: (value: RetailUnit) => void;
  caseFloorPrice?: string;
  onCaseFloorPrice?: (value: string) => void;
  caseFloorReadOnly?: boolean;
  showCaseFloor?: boolean;
  ids?: Partial<typeof DEFAULT_IDS>;
}) {
  const fieldIds = { ...DEFAULT_IDS, ...ids };
  const caseValue = caseFloorPrice ?? '';

  return (
    <div className={YIELD_PACK_GRID_CLASS}>
      <NumberField
        id={fieldIds.packSize}
        label="Pack size"
        value={packSize}
        onChange={onPackSize}
        className="block min-w-0 space-y-1.5"
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
          label="Case floor price"
          value={caseValue}
          onChange={onCaseFloorPrice ?? (() => {})}
          readOnly={caseFloorReadOnly || !onCaseFloorPrice}
        />
      ) : null}

      <NumberField
        id={fieldIds.yieldDivisor}
        label="Yield divisor"
        value={yieldDivisor}
        onChange={onYieldDivisor}
        step="0.001"
        className="block min-w-0 space-y-1.5"
      />
      <UnitSelect
        id={fieldIds.yieldInto}
        label="Into"
        aria-label="Yield divisor unit"
        value={yieldUnit}
        onChange={onYieldUnit}
      />
    </div>
  );
}
