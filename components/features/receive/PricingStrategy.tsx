'use client';

import React from 'react';
import type { MarginMode, YieldQuote } from '@/lib/domains/receiving/yieldPricing';
import { CurrencyField, SectionCard } from '@/components/ui/YieldFields';
import { MarginBadge } from '@/components/ui/MarginBadge';
import { cn } from '@/lib/utils/cn';

export function PricingStrategy({
  quote,
  marginMode,
  customMarginPercent,
  currentRetailPrice,
  onMarginMode,
  onCustomMargin,
  onCurrentRetailPrice,
  floorPriceFromMargin = false,
  floorPriceUnitLabel,
  highlightActiveMargin = false,
}: {
  quote: YieldQuote;
  marginMode: MarginMode;
  customMarginPercent: string;
  currentRetailPrice: string;
  onMarginMode: (mode: MarginMode) => void;
  onCustomMargin: (value: string) => void;
  onCurrentRetailPrice: (value: string) => void;
  /** When true, floor price is derived from target margin (not typed manually). */
  floorPriceFromMargin?: boolean;
  /** e.g. "lb" — floor price is always per split-factor sellable unit. */
  floorPriceUnitLabel?: string;
  /** Stronger selected-state for catalog item settings margin pills. */
  highlightActiveMargin?: boolean;
}) {
  const perUnitSuffix = floorPriceUnitLabel ? ` (per ${floorPriceUnitLabel})` : '';
  const modes: Array<{ id: MarginMode; label: string }> = [
    { id: '35', label: '35%' },
    { id: '40', label: '40%' },
    { id: 'custom', label: floorPriceFromMargin ? 'Custom price' : 'Custom' },
  ];

  const hint =
    floorPriceFromMargin && marginMode === 'custom'
      ? 'Enter custom floor price'
      : floorPriceFromMargin
        ? `Per sellable unit${perUnitSuffix}; updates when you pick 35% or 40%`
        : marginMode === 'custom'
          ? `Custom floor price per sellable unit${perUnitSuffix}`
          : 'Margin updates with the price';

  const floorReadOnly = floorPriceFromMargin && marginMode !== 'custom';

  return (
    <SectionCard
      step="3"
      title={floorPriceFromMargin ? 'Retail floor price' : 'Floor price'}
      hint={hint}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Target margin</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Target margin">
            {modes.map((mode) => {
              const active = marginMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onMarginMode(mode.id)}
                  className={cn(
                    'min-h-11 min-w-[4.5rem] rounded-full px-4 py-2 text-xs font-black transition active:scale-[0.98]',
                    highlightActiveMargin && active && mode.id === '35'
                      ? 'border-2 border-emerald-400/90 bg-emerald-950/50 text-emerald-100 shadow-[0_0_0_1px_rgba(52,211,153,0.25)]'
                      : highlightActiveMargin && active && mode.id === '40'
                        ? 'border-2 border-emerald-400/90 bg-emerald-950/50 text-emerald-100 shadow-[0_0_0_1px_rgba(52,211,153,0.25)]'
                        : highlightActiveMargin && active && mode.id === 'custom'
                          ? 'border-2 border-amber-400/80 bg-amber-950/40 text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.2)]'
                          : active
                            ? 'border border-blue-700 bg-blue-900/45 text-slate-100'
                            : 'border border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                  )}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>
        </div>
        {!floorPriceFromMargin && marginMode === 'custom' ? (
          <div className="w-28">
            <label htmlFor="custom-margin" className="block space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Custom %
              </span>
              <input
                id="custom-margin"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={customMarginPercent}
                onChange={(event) => onCustomMargin(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono text-sm font-bold tabular-nums text-slate-200 outline-none transition focus:border-slate-500 focus:ring-1 focus:ring-slate-600"
              />
            </label>
          </div>
        ) : null}
        <div className="min-w-[180px] flex-1">
          <CurrencyField
            id="current-retail-price"
            label={
              marginMode === 'custom'
                ? `Custom floor price${perUnitSuffix}`
                : `Floor price${perUnitSuffix}`
            }
            value={currentRetailPrice}
            onChange={onCurrentRetailPrice}
            readOnly={floorReadOnly}
          />
        </div>
        <div className="pb-1">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Margin</p>
          <MarginBadge currentMarginPct={quote.currentMarginPct} />
        </div>
      </div>
    </SectionCard>
  );
}
