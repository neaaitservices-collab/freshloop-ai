'use client';

import React from 'react';
import { RETAIL_UNITS, type RetailUnit } from '@/lib/domains/receiving/yieldPricing';
import { NumberField, SectionCard } from '@/components/ui/YieldFields';

export function YieldBreakdown({
  packSize,
  yieldDivisor,
  retailUnit,
  onPackSize,
  onYieldDivisor,
  onRetailUnit,
}: {
  packSize: string;
  yieldDivisor: string;
  retailUnit: RetailUnit;
  onPackSize: (value: string) => void;
  onYieldDivisor: (value: string) => void;
  onRetailUnit: (value: RetailUnit) => void;
}) {
  return (
    <SectionCard step="2" title="Yield" hint="Pack size ÷ divisor">
      <div className="grid gap-3 sm:grid-cols-3">
        <NumberField id="pack-size" label="Pack Size" value={packSize} onChange={onPackSize} />
        <NumberField
          id="yield-divisor"
          label="Yield Divisor"
          value={yieldDivisor}
          onChange={onYieldDivisor}
          step="0.001"
        />
        <label htmlFor="retail-unit" className="block space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            Retail Unit
          </span>
          <select
            id="retail-unit"
            value={retailUnit}
            onChange={(event) => onRetailUnit(event.target.value as RetailUnit)}
            className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm font-bold text-white outline-none transition focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-500/20"
          >
            {RETAIL_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </label>
      </div>
    </SectionCard>
  );
}
