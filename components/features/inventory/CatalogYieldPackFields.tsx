'use client';

import React from 'react';
import type { RetailUnit } from '@/lib/domains/receiving/yieldPricing';
import { CurrencyField, NumberField, UnitSelect } from '@/components/ui/YieldFields';

const YIELD_PACK_GRID =
  'grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(5.75rem,7.25rem)_minmax(0,1fr)] sm:gap-x-3 sm:gap-y-4';

/** Yield, pack, and case floor — Admin inventory catalog only (not Receive). */
export function CatalogYieldPackFields({
  packSize,
  yieldDivisor,
  packUnit,
  yieldUnit,
  caseFloorPrice,
  onPackSize,
  onYieldDivisor,
  onPackUnit,
  onYieldUnit,
  onCaseFloorPrice,
}: {
  packSize: string;
  yieldDivisor: string;
  packUnit: RetailUnit;
  yieldUnit: RetailUnit;
  caseFloorPrice: string;
  onPackSize: (value: string) => void;
  onYieldDivisor: (value: string) => void;
  onPackUnit: (value: RetailUnit) => void;
  onYieldUnit: (value: RetailUnit) => void;
  onCaseFloorPrice: (value: string) => void;
}) {
  return (
    <div className={YIELD_PACK_GRID}>
      <NumberField
        id="catalog-pack-size"
        label="Pack size"
        value={packSize}
        onChange={onPackSize}
        className="block min-w-0 space-y-1.5"
      />
      <UnitSelect
        id="catalog-pack-unit"
        label="Unit"
        aria-label="Pack size unit"
        value={packUnit}
        onChange={onPackUnit}
      />
      <CurrencyField
        id="catalog-case-floor-price"
        label="Case floor price"
        value={caseFloorPrice}
        onChange={onCaseFloorPrice}
      />

      <NumberField
        id="catalog-yield-divisor"
        label="Yield divisor"
        value={yieldDivisor}
        onChange={onYieldDivisor}
        step="0.001"
        className="block min-w-0 space-y-1.5"
      />
      <UnitSelect
        id="catalog-yield-into-unit"
        label="Into"
        aria-label="Yield divisor unit"
        value={yieldUnit}
        onChange={onYieldUnit}
      />
    </div>
  );
}
