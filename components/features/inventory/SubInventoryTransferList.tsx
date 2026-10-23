'use client';

import React, { useCallback, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import {
  SubInventoryTransferBar,
  type PerformInventoryMove,
  type TransferBarVariant,
} from '@/components/features/inventory/SubInventoryTransferBar';
import { SwipeTransferRow } from '@/components/features/inventory/SwipeTransferRow';
import { stockLevelToTransferRow } from '@/lib/domains/inventory/inventoryMoveClient';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import { formatCurrency, formatPercent, formatUnits, stockUnitLabel } from '@/lib/domains/receiving/yieldPricing';
import { useMediaMaxWidth } from '@/hooks/use-media-max-width';
import { cn } from '@/lib/utils/cn';

function casesLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function storedMargin(row: StockLevel): number | null {
  if (row.retailPrice === null || row.retailPrice <= 0) return null;
  return ((row.retailPrice - row.unitCost) / row.retailPrice) * 100;
}

function shelfCue(days: number): { label: string; className: string; warn: boolean } {
  const label = `${days} ${days === 1 ? 'day' : 'days'} left`;
  if (days < 2) return { label, className: 'text-[#C4847A]', warn: true };
  if (days <= 7) return { label, className: 'text-[#C4A574]', warn: true };
  return { label, className: 'text-slate-400', warn: false };
}

export function suggestedPullQty(row: StockLevel, pullDays: number): number {
  if (row.onHand <= 0) return 0;
  if (row.daysRemaining <= pullDays || row.low || row.isMarkdown) return row.onHand;
  return Math.min(row.onHand, 1);
}

function transferVariantForTab(tab: 'retail_floor' | 'kitchen_prep'): TransferBarVariant {
  return tab === 'retail_floor' ? 'floor' : 'kitchen';
}

export function SubInventoryTransferList({
  rows,
  location,
  pullDays = 3,
  staffId,
  compact,
  actionQueue = false,
  performMove,
  emptyMessage,
  onSuccess,
  onError,
}: {
  rows: StockLevel[];
  location: 'retail_floor' | 'kitchen_prep';
  pullDays?: number;
  staffId?: string;
  compact?: boolean;
  /** Short-dated floor board: stacked cards + swipe on touch viewports. */
  actionQueue?: boolean;
  performMove?: PerformInventoryMove;
  emptyMessage: string;
  onSuccess: (message: string, level: StockLevel) => void;
  onError: (message: string) => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const variant = transferVariantForTab(location);
  const touchViewport = useMediaMaxWidth(768);
  const swipeEnabled = actionQueue && location === 'retail_floor' && touchViewport && Boolean(performMove);

  const quickMove = useCallback(
    async (row: StockLevel, action: 'rescue' | 'waste') => {
      if (!performMove) return;
      const qty = suggestedPullQty(row, pullDays);
      if (!(qty > 0)) {
        onError('Nothing left on the floor to move.');
        return;
      }
      setPendingId(row.productId);
      const outcome = await performMove({
        productId: row.productId,
        action,
        quantity: qty,
        staffId,
        row: stockLevelToTransferRow(row),
      });
      setPendingId(null);
      if (outcome.success) {
        onSuccess(outcome.message, outcome.level);
      } else {
        onError(outcome.error);
      }
    },
    [performMove, pullDays, staffId, onSuccess, onError]
  );

  if (rows.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-slate-400">{emptyMessage}</p>;
  }

  return (
    <ul className={cn(actionQueue && 'space-y-2 p-2 md:space-y-0 md:p-0')}>
      {rows.map((row) => {
        const margin = storedMargin(row);
        const shelf = shelfCue(row.daysRemaining);
        const unit = stockUnitLabel(row.unitType);
        const qtyAtLocation = location === 'retail_floor' ? row.onHand : row.kitchenPrepQty;
        const defaultQty =
          location === 'retail_floor' ? suggestedPullQty(row, pullDays) : Math.min(row.kitchenPrepQty, 1);

        const rowBody = (
          <div
            className={cn(
              'flex flex-col gap-3 px-4 py-3 md:flex-row md:items-start',
              actionQueue &&
                'rounded-xl border border-slate-800/90 bg-slate-900/50 md:rounded-none md:border-0 md:border-b md:border-slate-800/80 md:bg-transparent'
            )}
          >
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-slate-100">{row.name}</span>
              <span className="mt-0.5 hidden truncate text-[11px] text-slate-500 md:block">
                {row.supplier}
              </span>
              <span className="mt-1 block font-mono text-[11px] text-slate-300">
                {location === 'retail_floor' ? (
                  <>
                    On floor: {formatUnits(row.onHand)} {unit}
                    <span className="hidden sm:inline">
                      {' '}
                      / {casesLabel(row.onHandCases)} cases
                    </span>
                    {row.kitchenPrepQty > 0 ? (
                      <span className="hidden text-emerald-400/90 md:inline">
                        {' '}
                        · Kitchen: {formatUnits(row.kitchenPrepQty)} {unit}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <>
                    In kitchen: {formatUnits(row.kitchenPrepQty)} {unit}
                    {row.onHand > 0 ? (
                      <span className="text-slate-400">
                        {' '}
                        · Floor: {formatUnits(row.onHand)} {unit}
                      </span>
                    ) : null}
                  </>
                )}
              </span>
              {location === 'retail_floor' ? (
                <span className="mt-0.5 hidden text-[11px] text-slate-400 sm:block">
                  {row.retailPrice !== null ? (
                    <>Shelf: {formatCurrency(row.retailPrice)} · </>
                  ) : null}
                  Margin: {margin === null ? '—' : `${formatPercent(margin)}%`}
                </span>
              ) : (
                <span className="mt-0.5 block text-[11px] text-slate-400">
                  MAC: {formatCurrency(row.unitCost)} / {unit} · Value:{' '}
                  {formatCurrency(qtyAtLocation * row.unitCost)}
                </span>
              )}
              {location === 'retail_floor' ? (
                <span
                  className={`mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold ${shelf.className}`}
                >
                  {shelf.warn ? <TriangleAlert className="h-3.5 w-3.5" /> : null}
                  {shelf.label}
                  {row.isMarkdown ? (
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-200">
                      30% off
                    </span>
                  ) : null}
                </span>
              ) : null}
              {swipeEnabled ? (
                <p className="mt-2 text-[10px] font-semibold text-slate-500 md:hidden">
                  Swipe → kitchen · ← waste
                </p>
              ) : null}
            </div>
            <div className="w-full md:max-w-md md:shrink-0">
              <SubInventoryTransferBar
                row={stockLevelToTransferRow(row)}
                staffId={staffId}
                defaultQty={defaultQty}
                variant={variant}
                compact={compact}
                performMove={performMove}
                busy={pendingId === row.productId}
                onBusyChange={(b) => setPendingId(b ? row.productId : null)}
                onSuccess={({ level, message }) => onSuccess(message, level)}
                onError={onError}
              />
            </div>
          </div>
        );

        return (
          <li key={row.productId} className={cn(!actionQueue && 'border-b border-slate-800/80 last:border-b-0')}>
            {swipeEnabled ? (
              <SwipeTransferRow
                enabled
                onSwipeRight={() => void quickMove(row, 'rescue')}
                onSwipeLeft={() => void quickMove(row, 'waste')}
              >
                {rowBody}
              </SwipeTransferRow>
            ) : (
              rowBody
            )}
          </li>
        );
      })}
    </ul>
  );
}
