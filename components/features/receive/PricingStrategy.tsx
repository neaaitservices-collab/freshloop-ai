'use client';

import React from 'react';
import type { MarginMode, YieldQuote } from '@/lib/domains/receiving/yieldPricing';
import { CurrencyField, SectionCard } from '@/components/ui/YieldFields';
import { MarginBadge } from '@/components/ui/MarginBadge';

export function PricingStrategy({
  quote,
  marginMode,
  customMarginPercent,
  currentRetailPrice,
  onMarginMode,
  onCustomMargin,
  onCurrentRetailPrice,
  floorPriceFromMargin = false,
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
}) {
  const modes: Array<{ id: MarginMode; label: string }> = [
    { id: '35', label: '35%' },
    { id: '40', label: '40%' },
    { id: 'custom', label: floorPriceFromMargin ? 'Custom price' : 'Custom' },
  ];

  const hint =
    floorPriceFromMargin && marginMode === 'custom'
      ? 'Enter custom floor price'
      : floorPriceFromMargin
        ? 'Set by target margin'
        : marginMode === 'custom'
          ? 'Enter custom floor price'
          : 'Margin updates with the price';

  const floorReadOnly = floorPriceFromMargin && marginMode !== 'custom';

  return (
    <SectionCard step="3" title="Floor price" hint={hint}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Target margin</p>
          <div className="flex gap-1.5">
            {modes.map((mode) => {
              const active = marginMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => onMarginMode(mode.id)}
                  className={`rounded-full px-3 py-2 text-xs font-black transition active:scale-95 ${
                    active
                      ? 'border border-blue-800 bg-blue-900/40 text-slate-100'
                      : 'border border-slate-700 bg-slate-950 text-slate-300 hover:border-blue-800/60'
                  }`}
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
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono text-sm font-bold text-slate-200 outline-none transition focus:border-slate-500 focus:ring-1 focus:ring-slate-600"
              />
            </label>
          </div>
        ) : null}
        <div className="min-w-[180px] flex-1">
          <CurrencyField
            id="current-retail-price"
            label={marginMode === 'custom' ? 'Custom floor price' : 'Floor price'}
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
