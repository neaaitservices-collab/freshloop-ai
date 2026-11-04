'use client';

import React, { useMemo } from 'react';
import { formatUnits, type RetailUnit } from '@/lib/domains/receiving/yieldPricing';
import { cn } from '@/lib/utils/cn';
import { CurrencyField, NumberField, SectionCard, UnitSelect } from '@/components/ui/YieldFields';

function toPositiveNumber(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function YieldBreakdown({
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
}: {
  packSize: string;
  yieldDivisor: string;
  packUnit: RetailUnit;
  yieldUnit: RetailUnit;
  onPackSize: (value: string) => void;
  onYieldDivisor: (value: string) => void;
  onPackUnit: (value: RetailUnit) => void;
  onYieldUnit: (value: RetailUnit) => void;
  /** Case shelf price for one received case (editable in item settings / receive). */
  caseFloorPrice?: string;
  onCaseFloorPrice?: (value: string) => void;
}) {
  const showCaseFloor = onCaseFloorPrice != null || caseFloorPrice != null;
  const caseFloorValue = caseFloorPrice ?? '';
  const sellablePerCase = useMemo(() => {
    const pack = toPositiveNumber(packSize);
    const divisor = toPositiveNumber(yieldDivisor);
    if (!(pack > 0) || !(divisor > 0)) return null;
    return pack / divisor;
  }, [packSize, yieldDivisor]);

  const unitsMismatch = packUnit !== yieldUnit;

  return (
    <SectionCard step="2" title="Yield" hint="Pack size ÷ divisor">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pack size</span>
          <div className="flex items-end gap-2">
            <NumberField
              id="pack-size"
              label=""
              value={packSize}
              onChange={onPackSize}
              className="min-w-0 flex-1"
            />
            <UnitSelect
              id="pack-unit"
              label="Unit"
              aria-label="Pack size unit"
              value={packUnit}
              onChange={onPackUnit}
            />
          </div>
          <p className="text-[11px] text-slate-500">
            How much is in one received case ({packUnit}).
          </p>
        </div>
        {showCaseFloor ? (
          <div className="space-y-1.5">
            <CurrencyField
              id="case-floor-price-yield"
              label="Case floor price"
              value={caseFloorValue}
              onChange={onCaseFloorPrice ?? (() => {})}
              readOnly={!onCaseFloorPrice}
            />
            <p className="text-[11px] text-slate-500">
              Shelf price for one case (from invoice when listed, or 35% / 40% margin on case cost).
            </p>
          </div>
        ) : null}
        <div className={cn('space-y-1.5', showCaseFloor && 'sm:col-span-2')}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Yield divisor</span>
          <div className="flex items-end gap-2">
            <NumberField
              id="yield-divisor"
              label=""
              value={yieldDivisor}
              onChange={onYieldDivisor}
              step="0.001"
              className="min-w-0 flex-1"
            />
            <UnitSelect
              id="yield-into-unit"
              label="Into"
              aria-label="Yield divisor unit — divide into"
              value={yieldUnit}
              onChange={onYieldUnit}
            />
          </div>
          <p className="text-[11px] text-slate-500">
            Divide {packUnit} into sellable {yieldUnit} (e.g. {packSize || '40'} ÷ {yieldDivisor || '1'}).
          </p>
        </div>
      </div>
      {unitsMismatch ? (
        <p className="text-[11px] text-amber-300/90">
          Pack unit ({packUnit}) and sell unit ({yieldUnit}) differ — confirm pack ÷ divisor matches how you
          count shelf stock.
        </p>
      ) : null}
      {sellablePerCase !== null ? (
        <p className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-center text-[11px] text-slate-400">
          1 case ={' '}
          <span className="font-mono font-bold text-emerald-300/90">
            {formatUnits(sellablePerCase)} {yieldUnit}
          </span>{' '}
          on the shelf
          {packUnit !== yieldUnit ? (
            <span className="text-slate-500">
              {' '}
              (from {formatUnits(toPositiveNumber(packSize) || 0)} {packUnit} ÷{' '}
              {formatUnits(toPositiveNumber(yieldDivisor) || 0)})
            </span>
          ) : null}
        </p>
      ) : null}
    </SectionCard>
  );
}
