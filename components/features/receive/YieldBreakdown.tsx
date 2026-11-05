'use client';

import React, { useMemo } from 'react';
import { formatUnits, type RetailUnit } from '@/lib/domains/receiving/yieldPricing';
import { SectionCard } from '@/components/ui/YieldFields';
import { YieldPackInputs } from '@/components/ui/YieldPackInputs';

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
  compact = false,
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
  compact?: boolean;
}) {
  const showCaseFloor = onCaseFloorPrice != null || caseFloorPrice != null;
  const sellablePerCase = useMemo(() => {
    const pack = toPositiveNumber(packSize);
    const divisor = toPositiveNumber(yieldDivisor);
    if (!(pack > 0) || !(divisor > 0)) return null;
    return pack / divisor;
  }, [packSize, yieldDivisor]);

  const unitsMismatch = packUnit !== yieldUnit;

  return (
    <SectionCard step="2" title="Yield" hint="Pack size ÷ divisor">
      <YieldPackInputs
        ids={{
          packSize: 'pack-size',
          packUnit: 'pack-unit',
          caseFloor: 'case-floor-price-yield',
          yieldDivisor: 'yield-divisor',
          yieldInto: 'yield-into-unit',
        }}
        packSize={packSize}
        yieldDivisor={yieldDivisor}
        packUnit={packUnit}
        yieldUnit={yieldUnit}
        onPackSize={onPackSize}
        onYieldDivisor={onYieldDivisor}
        onPackUnit={onPackUnit}
        onYieldUnit={onYieldUnit}
        caseFloorPrice={caseFloorPrice}
        onCaseFloorPrice={onCaseFloorPrice}
        caseFloorReadOnly={!onCaseFloorPrice}
        showCaseFloor={showCaseFloor}
      />
      {!compact && showCaseFloor ? (
        <p className="text-[11px] text-slate-500">
          Shelf price for one case (from invoice when listed, or 35% / 40% margin on case cost).
        </p>
      ) : null}
      {!compact ? (
        <p className="text-[11px] text-slate-500">
          Pack ÷ yield divisor = sellable units on shelf (e.g. {packSize || '40'} ÷ {yieldDivisor || '1'}{' '}
          {yieldUnit}).
        </p>
      ) : null}
      {unitsMismatch ? (
        <p className="text-[11px] text-amber-300/90">
          Pack unit ({packUnit}) and sell unit ({yieldUnit}) differ — confirm pack ÷ divisor matches how you
          count shelf stock.
        </p>
      ) : null}
      {sellablePerCase !== null ? (
        <p className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-center text-[11px] text-slate-400">
          1 case ={' '}
          <span className="font-mono font-bold tabular-nums text-emerald-300/90">
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
