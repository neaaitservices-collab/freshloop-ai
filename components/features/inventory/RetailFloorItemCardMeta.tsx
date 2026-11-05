'use client';

import React from 'react';
import { Pencil, TriangleAlert, Trash2 } from 'lucide-react';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import {
  BUNDLE_MARGIN_ALERT_PCT,
  computeBundleDealEconomics,
} from '@/lib/domains/pricing/bundleDealEconomics';
import { formatCurrency, formatPercent, formatUnits, stockUnitLabel } from '@/lib/domains/receiving/yieldPricing';
import { cn } from '@/lib/utils/cn';

export type ItemBundlePromoHint = {
  id?: string;
  minUnits: number;
  bundlePrice: number;
  label?: string | null;
};

function shelfCue(days: number): { label: string; className: string; warn: boolean } {
  const label = `${days} ${days === 1 ? 'day' : 'days'} left`;
  if (days < 2) return { label, className: 'text-[#C4847A]', warn: true };
  if (days <= 7) return { label, className: 'text-[#C4A574]', warn: true };
  return { label, className: 'text-slate-400', warn: false };
}

export function itemSupplierLabel(row: StockLevel): string {
  return row.supplier?.trim() ? row.supplier.trim() : 'Unassigned supplier';
}

export function itemOriginLabel(row: StockLevel): string {
  return row.origin?.trim() ? row.origin.trim() : '—';
}

export function originFloorUnitPrice(row: StockLevel): number | null {
  if (row.regularRetailPrice != null && row.regularRetailPrice > 0) {
    return row.regularRetailPrice;
  }
  if (row.retailPrice != null && row.retailPrice > 0) {
    return row.retailPrice;
  }
  return null;
}

function bundlePromoText(promo: ItemBundlePromoHint): string {
  if (promo.label?.trim()) return promo.label.trim();
  return `${promo.minUnits} for ${formatCurrency(promo.bundlePrice)}`;
}

/** Margin % at the price customers pay on shelf (markdown shelf price when active). */
export function shelfMarginProfitPct(row: StockLevel): number | null {
  const sell =
    row.retailPrice != null && row.retailPrice > 0
      ? row.retailPrice
      : originFloorUnitPrice(row);
  if (sell == null || sell <= 0) return null;
  return Number((((sell - row.unitCost) / sell) * 100).toFixed(1));
}

function marginProfitClass(pct: number | null): string {
  if (pct == null) return 'text-slate-400';
  if (pct < 0) return 'text-rose-300';
  if (pct < BUNDLE_MARGIN_ALERT_PCT) return 'text-amber-200';
  return 'text-emerald-300';
}

export function RetailFloorItemCardMeta({
  row,
  bundlePromo,
  dense = false,
  showShelfLife = true,
  showBundleActions = false,
  onEditBundle,
  onRemoveBundle,
  bundleActionsBusy = false,
}: {
  row: StockLevel;
  bundlePromo?: ItemBundlePromoHint | null;
  dense?: boolean;
  showShelfLife?: boolean;
  /** Owner / store manager — edit or remove saved bundle promo. */
  showBundleActions?: boolean;
  onEditBundle?: () => void;
  onRemoveBundle?: () => void;
  bundleActionsBusy?: boolean;
}) {
  const unit = stockUnitLabel(row.unitType);
  const shelf = shelfCue(row.daysRemaining);
  const origPrice = originFloorUnitPrice(row);
  const showMarkdownShelf =
    row.isMarkdown && row.retailPrice != null && origPrice != null && row.retailPrice < origPrice * 0.99;
  const marginPct = shelfMarginProfitPct(row);
  const bundleMarginPct =
    bundlePromo != null
      ? computeBundleDealEconomics({
          minUnits: bundlePromo.minUnits,
          bundlePrice: bundlePromo.bundlePrice,
          unitCost: row.unitCost,
          regularUnitPrice: origPrice,
        }).marginPct
      : null;

  return (
    <div className={cn('min-w-0', dense ? 'mt-1 space-y-1' : 'mt-2 space-y-2')}>
      {showShelfLife ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-bold',
              shelf.warn
                ? 'border-amber-500/40 bg-amber-950/40 text-amber-100'
                : 'border-slate-700 bg-slate-950/80 text-slate-300'
            )}
          >
            {shelf.warn ? <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden /> : null}
            {shelf.label}
          </span>
          {row.isMarkdown ? (
            <span className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-200">
              {row.markdownPct ? `${row.markdownPct}% off` : 'Markdown'}
            </span>
          ) : null}
        </div>
      ) : null}

      <dl
        className={cn(
          'grid gap-1.5 font-medium text-slate-300',
          dense ? 'text-[10px]' : 'text-[11px]'
        )}
      >
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
          <div className="min-w-0 flex-1">
            <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Supplier</dt>
            <dd className="truncate font-semibold text-slate-300" title={itemSupplierLabel(row)}>
              {itemSupplierLabel(row)}
            </dd>
          </div>
          <div className="min-w-0 flex-1">
            <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Origin</dt>
            <dd className="truncate font-semibold text-slate-200" title={itemOriginLabel(row)}>
              {itemOriginLabel(row)}
            </dd>
          </div>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
          <div className="min-w-0">
            <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Floor</dt>
            <dd className="font-mono font-bold tabular-nums text-emerald-200">
              {formatUnits(row.onHand)} {unit}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Prod</dt>
            <dd className="font-mono font-bold tabular-nums text-amber-100">
              {formatUnits(row.kitchenPrepQty)} {unit}
            </dd>
          </div>
        </div>

        <div>
          <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Orig floor price
          </dt>
          <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-mono text-sm font-black tabular-nums text-slate-100">
              {origPrice != null ? `${formatCurrency(origPrice)} / ${unit}` : '—'}
            </span>
            {showMarkdownShelf ? (
              <span className="font-mono text-xs tabular-nums text-amber-200">
                Shelf {formatCurrency(row.retailPrice!)}
              </span>
            ) : null}
          </dd>
        </div>

        <div>
          <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Margin profit
          </dt>
          <dd
            className={cn(
              'mt-0.5 font-mono text-sm font-black tabular-nums',
              marginProfitClass(marginPct)
            )}
          >
            {marginPct == null ? '—' : `${formatPercent(marginPct)}%`}
            {showMarkdownShelf ? (
              <span className="ml-1.5 text-[10px] font-semibold text-slate-500">at shelf</span>
            ) : null}
          </dd>
        </div>

        {bundlePromo ? (
          <div>
            <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Bundle</dt>
            <dd className="mt-0.5">
              <span className="inline-flex max-w-full flex-wrap items-center gap-2">
                <span className="inline-flex max-w-full items-center rounded-lg border border-amber-500/40 bg-amber-950/45 px-2.5 py-1 font-mono text-xs font-bold tabular-nums text-amber-100">
                  {bundlePromoText(bundlePromo)}
                </span>
                {bundleMarginPct != null ? (
                  <span
                    className={cn(
                      'font-mono text-xs font-bold tabular-nums',
                      marginProfitClass(bundleMarginPct)
                    )}
                  >
                    {formatPercent(bundleMarginPct)}% bundle margin
                  </span>
                ) : null}
              </span>
              {showBundleActions && bundlePromo ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={bundleActionsBusy}
                    onClick={onEditBundle}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-500/45 bg-amber-950/50 px-3 text-[11px] font-bold text-amber-100 hover:bg-amber-950/70 disabled:opacity-50 sm:flex-none sm:min-w-[7.5rem]"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Edit bundle
                  </button>
                  <button
                    type="button"
                    disabled={bundleActionsBusy}
                    onClick={onRemoveBundle}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/60 px-3 text-[11px] font-bold text-slate-300 hover:border-rose-900/50 hover:bg-rose-950/40 hover:text-rose-200 disabled:opacity-50 sm:flex-none sm:min-w-[7.5rem]"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Remove
                  </button>
                </div>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
