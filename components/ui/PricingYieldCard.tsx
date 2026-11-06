'use client';

import React, { useMemo } from 'react';
import type { MarginMode, RetailUnit, YieldQuote } from '@/lib/domains/receiving/yieldPricing';
import {
  formatCurrency,
  formatUnits,
  sellableUnitShortLabel,
  sellableUnitsPerCase,
} from '@/lib/domains/receiving/yieldPricing';
import { PricingStrategy } from '@/components/features/receive/PricingStrategy';
import { YieldPackInputs } from '@/components/ui/YieldPackInputs';
import { CurrencyField, ReadOnlyStat } from '@/components/ui/YieldFields';
import { cn } from '@/lib/utils/cn';

function toPositiveNumber(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export type PricingYieldCardProps = {
  /** e.g. "Pricing & yield" */
  sectionLabel?: string;
  itemName?: string;
  itemSubtitle?: string | null;
  compactHeader?: boolean;
  caseCost: number;
  /** Shown between case cost and sellable count (e.g. cases received on receive). */
  middleStats?: Array<{ label: string; value: string }>;
  packSize: string;
  splitFactor: string;
  packUnit: RetailUnit;
  yieldUnit: RetailUnit;
  caseShelfPrice: string;
  currentRetailPrice: string;
  marginMode: MarginMode;
  customMarginPercent: string;
  quote: YieldQuote;
  savedPrefsHint?: string | null;
  onPackSize: (value: string) => void;
  onSplitFactor: (value: string) => void;
  onPackUnit: (value: RetailUnit) => void;
  onYieldUnit: (value: RetailUnit) => void;
  onCaseShelfPrice: (value: string) => void;
  onMarginMode: (mode: MarginMode) => void;
  onCustomMargin: (value: string) => void;
  onRetailFloorPrice: (value: string) => void;
  /** Receive only — catalog hides invoice case list price. */
  showCaseShelf?: boolean;
  /** Catalog: read-only case cost with optional edit toggle. */
  caseCostEditToggle?: boolean;
  caseCostEditing?: boolean;
  onCaseCostEditingChange?: (editing: boolean) => void;
  caseCostInput?: string;
  onCaseCostInput?: (value: string) => void;
  onResetCaseCost?: () => void;
  caseCostOverridden?: boolean;
  /** Prefix for input ids (receive vs catalog). */
  idPrefix?: string;
  className?: string;
  children?: React.ReactNode;
};

/** Shared yield, unit cost, case shelf, and margin controls (receive + catalog). */
export function PricingYieldCard({
  sectionLabel = 'Pricing & yield',
  itemName,
  itemSubtitle,
  compactHeader = false,
  caseCost,
  middleStats = [],
  packSize,
  splitFactor,
  packUnit,
  yieldUnit,
  caseShelfPrice,
  currentRetailPrice,
  marginMode,
  customMarginPercent,
  quote,
  savedPrefsHint,
  onPackSize,
  onSplitFactor,
  onPackUnit,
  onYieldUnit,
  onCaseShelfPrice,
  onMarginMode,
  onCustomMargin,
  onRetailFloorPrice,
  showCaseShelf = true,
  caseCostEditToggle = false,
  caseCostEditing = false,
  onCaseCostEditingChange,
  caseCostInput = '',
  onCaseCostInput,
  onResetCaseCost,
  caseCostOverridden = false,
  idPrefix = 'pricing-yield',
  className,
  children,
}: PricingYieldCardProps) {
  const pack = toPositiveNumber(packSize);
  const split = toPositiveNumber(splitFactor);
  const sellable = useMemo(() => sellableUnitsPerCase(pack, split), [pack, split]);
  const sellLabel = sellableUnitShortLabel(yieldUnit);
  const unitCost = quote.unitCost;

  const statCount = 2 + middleStats.length;
  const statGridClass =
    statCount >= 3
      ? 'grid grid-cols-2 gap-3 sm:grid-cols-3'
      : 'grid grid-cols-2 gap-3';

  return (
    <article
      className={cn(
        'min-w-0 rounded-3xl border border-slate-800 bg-slate-900/85 shadow-lg shadow-black/20',
        className
      )}
    >
      <header className="border-b border-slate-800 px-4 py-3 sm:px-5 sm:py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400/90">
          {sectionLabel}
        </p>
        {!compactHeader && itemName ? (
          <>
            <h2 className="mt-1 truncate text-lg font-black text-white" title={itemName}>
              {itemName}
            </h2>
            {itemSubtitle ? (
              <p className="mt-0.5 truncate text-xs text-slate-500" title={itemSubtitle}>
                {itemSubtitle}
              </p>
            ) : null}
          </>
        ) : compactHeader ? (
          <p className="mt-1 text-xs text-slate-400">
            Configure pack, cost, and retail floor for this item.
          </p>
        ) : null}
      </header>

      <div className="space-y-5 px-4 py-4 sm:px-5 sm:py-5">
        {savedPrefsHint ? (
          <p className="rounded-2xl border border-blue-900/40 bg-blue-950/30 px-3.5 py-2.5 text-[11px] font-semibold leading-snug text-blue-200/95">
            {savedPrefsHint}
          </p>
        ) : null}

        <div className={statGridClass}>
          {caseCostEditToggle ? (
            <div className="min-w-0">
              {caseCostEditing ? (
                <div className="space-y-2">
                  <CurrencyField
                    id={`${idPrefix}-case-cost`}
                    label="Case cost"
                    value={caseCostInput}
                    onChange={onCaseCostInput ?? (() => {})}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onResetCaseCost?.();
                        onCaseCostEditingChange?.(false);
                      }}
                      className="min-h-11 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-slate-300 transition hover:bg-slate-800"
                    >
                      Reset to catalog cost
                    </button>
                    <button
                      type="button"
                      onClick={() => onCaseCostEditingChange?.(false)}
                      className="min-h-11 rounded-xl border border-emerald-800/50 bg-emerald-950/40 px-3 text-xs font-bold text-emerald-300 transition hover:bg-emerald-950/70"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex min-w-0 items-end justify-between gap-2">
                    <ReadOnlyStat label="Case cost" value={formatCurrency(caseCost)} />
                    <button
                      type="button"
                      onClick={() => onCaseCostEditingChange?.(true)}
                      className="min-h-11 shrink-0 rounded-xl border border-slate-700 bg-slate-900 px-3.5 text-xs font-black uppercase tracking-wide text-emerald-300 transition hover:border-slate-600 hover:bg-slate-800"
                    >
                      Edit
                    </button>
                  </div>
                  {caseCostOverridden ? (
                    <p className="text-[10px] font-semibold leading-snug text-amber-300/90">
                      Repricing case cost — unit baseline and floor (35% / 40%) update with save. Custom floor
                      stays until you change margin or price.
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-500">From last receive / catalog cost</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <ReadOnlyStat label="CASE COST" value={formatCurrency(caseCost)} />
          )}
          {middleStats.map((stat) => (
            <ReadOnlyStat key={stat.label} label={stat.label} value={stat.value} />
          ))}
          <div className={cn(statCount >= 3 && 'col-span-2 sm:col-span-1')}>
            <ReadOnlyStat
              label="Sellable / case"
              value={sellable > 0 ? `${formatUnits(sellable)} ${yieldUnit}` : '—'}
            />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Yield &amp; pack</p>
          <YieldPackInputs
            ids={{
              packSize: `${idPrefix}-pack-size`,
              packUnit: `${idPrefix}-pack-unit`,
              splitFactor: `${idPrefix}-split-factor`,
              yieldInto: `${idPrefix}-yield-unit`,
            }}
            packSize={packSize}
            splitFactor={splitFactor}
            packUnit={packUnit}
            yieldUnit={yieldUnit}
            onPackSize={onPackSize}
            onSplitFactor={onSplitFactor}
            onPackUnit={onPackUnit}
            onYieldUnit={onYieldUnit}
            showCaseFloor={false}
          />
        </div>

        <div
          className={cn(
            'rounded-xl border px-4 py-3',
            unitCost !== null && unitCost > 0
              ? 'border-slate-800 bg-slate-950/70'
              : 'border-amber-900/40 bg-amber-950/25'
          )}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Unit cost (baseline)</p>
          <p className="mt-1 font-mono text-2xl font-black tabular-nums text-emerald-300">
            {unitCost !== null && unitCost > 0 ? formatCurrency(unitCost) : '—'}
            <span className="ml-1 text-sm font-bold text-slate-400">/ {sellLabel}</span>
          </p>
          <p className="mt-2 text-[11px] leading-snug text-slate-500">
            Case cost ÷ sellable units = {formatCurrency(caseCost)} ÷ (
            {formatUnits(pack || 0)} ÷ {formatUnits(split || 0)}) = case cost ÷{' '}
            <span className="font-mono tabular-nums text-slate-300">
              {sellable > 0 ? formatUnits(sellable) : '—'}
            </span>
          </p>
        </div>

        {showCaseShelf ? (
          <div className="space-y-1.5">
            <CurrencyField
              id={`${idPrefix}-case-shelf`}
              label="Case shelf ($)"
              value={caseShelfPrice}
              onChange={onCaseShelfPrice}
            />
            <p className="text-[11px] text-slate-500">
              Optional list price from the invoice. Does not change unit floor when you pick 35% / 40%.
            </p>
          </div>
        ) : null}

        <div className={cn('border-t border-slate-800 pt-4', !showCaseShelf && 'border-t-0 pt-0')}>
          <PricingStrategy
            quote={quote}
            marginMode={marginMode}
            customMarginPercent={customMarginPercent}
            currentRetailPrice={currentRetailPrice}
            floorPriceFromMargin
            highlightActiveMargin
            floorPriceUnitLabel={sellLabel}
            onMarginMode={onMarginMode}
            onCustomMargin={onCustomMargin}
            onCurrentRetailPrice={onRetailFloorPrice}
          />
        </div>

        {children}
      </div>
    </article>
  );
}
