'use client';

import React from 'react';
import type { RetailUnit } from '@/lib/domains/receiving/yieldPricing';
import { CurrencyField, NumberField, UnitSelect } from '@/components/ui/YieldFields';

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
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="min-w-0 space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pack size</span>
        <div className="flex min-w-0 items-end gap-2">
          <NumberField
            id="catalog-pack-size"
            label=""
            value={packSize}
            onChange={onPackSize}
            className="min-w-0 flex-1"
          />
          <UnitSelect
            id="catalog-pack-unit"
            label="Unit"
            aria-label="Pack size unit"
            value={packUnit}
            onChange={onPackUnit}
          />
        </div>
      </div>
      <div className="min-w-0 space-y-1.5">
        <CurrencyField
          id="catalog-case-floor-price"
          label="Case floor price"
          value={caseFloorPrice}
          onChange={onCaseFloorPrice}
        />
      </div>
      <div className="min-w-0 space-y-1.5 sm:col-span-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Yield divisor</span>
        <div className="flex min-w-0 items-end gap-2">
          <NumberField
            id="catalog-yield-divisor"
            label=""
            value={yieldDivisor}
            onChange={onYieldDivisor}
            step="0.001"
            className="min-w-0 flex-1"
          />
          <UnitSelect
            id="catalog-yield-into-unit"
            label="Into"
            aria-label="Yield divisor unit"
            value={yieldUnit}
            onChange={onYieldUnit}
          />
        </div>
      </div>
    </div>
  );
}
