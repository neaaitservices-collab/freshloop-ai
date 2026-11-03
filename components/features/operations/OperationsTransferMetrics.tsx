'use client';

import React from 'react';
import { ChefHat, Store } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { SubInventoryTab } from '@/lib/domains/inventory/subInventoryView';

export function OperationsTransferMetrics({
  floorUnits,
  kitchenUnits,
  activeTab,
  onTabChange,
  showKitchenTab,
  hideFloorTab = false,
  compact = false,
}: {
  floorUnits: number;
  kitchenUnits: number;
  activeTab: SubInventoryTab;
  onTabChange: (tab: SubInventoryTab) => void;
  showKitchenTab: boolean;
  hideFloorTab?: boolean;
  compact?: boolean;
}) {
  const showFloor = !hideFloorTab;
  const floorActive = activeTab === 'retail_floor';
  const kitchenActive = activeTab === 'kitchen_prep';
  const columnCount = (showFloor ? 1 : 0) + (showKitchenTab ? 1 : 0);

  return (
    <div
      className={cn(
        'grid min-w-0 gap-3',
        columnCount > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'
      )}
      role="tablist"
      aria-label="Sub-inventory totals"
    >
      {showFloor ? (
      <button
        type="button"
        role="tab"
        aria-selected={floorActive}
        onClick={() => onTabChange('retail_floor')}
        className={cn(
          'rounded-xl border text-left transition-all',
          compact ? 'p-3' : 'p-5',
          floorActive
            ? 'border-emerald-400/60 bg-gradient-to-br from-emerald-950/90 via-slate-900 to-slate-950 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/30'
            : 'border-slate-800 bg-slate-900/80 hover:border-slate-700 hover:bg-slate-900'
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                'flex items-center justify-center rounded-xl border',
                compact ? 'h-8 w-8' : 'h-10 w-10',
                floorActive
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-700 bg-slate-950 text-slate-400'
              )}
            >
              <Store className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Retail floor
              </p>
              <p
                className={cn(
                  'mt-0.5 font-mono font-black tabular-nums text-white',
                  compact ? 'text-lg' : 'text-2xl'
                )}
              >
                {floorUnits.toFixed(1)}
                <span className="ml-1.5 text-sm font-bold text-slate-400">u</span>
              </p>
            </div>
          </div>
          {floorActive ? (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-200">
              Active
            </span>
          ) : null}
        </div>
        {!compact ? (
          <p className="mt-3 text-[11px] font-medium text-slate-400">
            Shelf stock available for sales and rescue to production.
          </p>
        ) : null}
      </button>
      ) : null}

      {showKitchenTab ? (
        <button
          type="button"
          role="tab"
          aria-selected={kitchenActive}
          onClick={() => onTabChange('kitchen_prep')}
          className={cn(
            'rounded-xl border text-left transition-all',
            compact ? 'p-3' : 'p-5',
            kitchenActive
              ? 'border-amber-400/50 bg-gradient-to-br from-amber-950/80 via-slate-900 to-slate-950 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/30'
              : 'border-slate-800 bg-slate-900/80 hover:border-slate-700 hover:bg-slate-900'
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  'flex items-center justify-center rounded-xl border',
                  compact ? 'h-8 w-8' : 'h-10 w-10',
                  kitchenActive
                    ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                    : 'border-slate-700 bg-slate-950 text-slate-400'
                )}
              >
                <ChefHat className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Production prep
                </p>
                <p
                  className={cn(
                    'mt-0.5 font-mono font-black tabular-nums text-white',
                    compact ? 'text-lg' : 'text-2xl'
                  )}
                >
                  {kitchenUnits.toFixed(1)}
                  <span className="ml-1.5 text-sm font-bold text-slate-400">u</span>
                </p>
              </div>
            </div>
            {kitchenActive ? (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-200">
                Active
              </span>
            ) : null}
          </div>
          {!compact ? (
            <p className="mt-3 text-[11px] font-medium text-slate-400">
              Rescued ingredients and prep stock ready for recipes and scrap logging.
            </p>
          ) : null}
        </button>
      ) : null}
    </div>
  );
}
