'use client';

import React from 'react';
import type { MarginMode, YieldQuote } from '@/lib/domains/receiving/yieldPricing';
import { CurrencyField, NumberField, SectionCard } from '@/components/ui/YieldFields';
import { MarginBadge } from '@/components/ui/MarginBadge';

export function PricingStrategy({
  quote,
  marginMode,
  customMarginPercent,
  currentRetailPrice,
  onMarginMode,
  onCustomMargin,
  onCurrentRetailPrice,
}: {
  quote: YieldQuote;
  marginMode: MarginMode;
  customMarginPercent: string;
  currentRetailPrice: string;
  onMarginMode: (mode: MarginMode) => void;
  onCustomMargin: (value: string) => void;
  onCurrentRetailPrice: (value: string) => void;
}) {
  const modes: Array<{ id: MarginMode; label: string }> = [
    { id: '35', label: '35%' },
    { id: '40', label: '40%' },
    { id: 'custom', label: 'Custom' },
  ];

  return (
    <SectionCard step="3" title="Floor price" hint="Margin updates with the price">
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
        {marginMode === 'custom' ? (
          <div className="w-28">
            <NumberField
              id="custom-margin"
              label="Custom %"
              value={customMarginPercent}
              onChange={onCustomMargin}
              min="0"
              step="0.1"
            />
          </div>
        ) : null}
        <div className="min-w-[180px] flex-1">
          <CurrencyField
            id="current-retail-price"
            label="Current retail price"
            value={currentRetailPrice}
            onChange={onCurrentRetailPrice}
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
