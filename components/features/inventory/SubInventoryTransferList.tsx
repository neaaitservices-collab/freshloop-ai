'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRightLeft, ChevronRight, Trash2, TriangleAlert } from 'lucide-react';
import { OperationsTransferItemModal } from '@/components/features/operations/OperationsTransferItemModal';
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
  layoutVariant = 'default',
  listDensity = 'default',
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
  layoutVariant?: 'default' | 'operations';
  listDensity?: 'default' | 'compact';
  /** Short-dated floor board: stacked cards + swipe on touch viewports. */
  actionQueue?: boolean;
  performMove?: PerformInventoryMove;
  emptyMessage: string;
  onSuccess: (message: string, level: StockLevel) => void;
  onError: (message: string) => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [modalProductId, setModalProductId] = useState<string | null>(null);
  const variant = transferVariantForTab(location);
  const operations = layoutVariant === 'operations';
  const dense = listDensity === 'compact' && operations;
  const modalRow =
    modalProductId != null ? (rows.find((r) => r.productId === modalProductId) ?? null) : null;

  useEffect(() => {
    if (
      modalProductId &&
      rows.length > 0 &&
      !rows.some((r) => r.productId === modalProductId)
    ) {
      setModalProductId(null);
    }
  }, [rows, modalProductId]);

  const touchViewport = useMediaMaxWidth(768);
  /** Short-dated queue: confirm transfers in modal (no inline waste/markdown on the list). */
  const queueModalActions = actionQueue && !operations && location === 'retail_floor';
  const swipeEnabled =
    actionQueue &&
    !queueModalActions &&
    location === 'retail_floor' &&
    touchViewport &&
    Boolean(performMove);

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
    <>
    <ul
      className={cn(
        operations && (dense ? 'space-y-1.5 p-2' : 'space-y-3 p-3'),
        actionQueue && !operations && 'space-y-2 p-2 md:space-y-0 md:p-0'
      )}
    >
      {rows.map((row) => {
        const margin = storedMargin(row);
        const shelf = shelfCue(row.daysRemaining);
        const unit = stockUnitLabel(row.unitType);
        const qtyAtLocation = location === 'retail_floor' ? row.onHand : row.kitchenPrepQty;
        const defaultQty =
          location === 'retail_floor' ? suggestedPullQty(row, pullDays) : Math.min(row.kitchenPrepQty, 1);

        const stockPills = (
          <div className={cn('flex flex-wrap gap-1.5', dense ? 'mt-1.5' : 'mt-3 gap-2')}>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-950/50 font-bold text-emerald-200',
                dense ? 'px-2 py-0.5 text-[10px]' : 'gap-1.5 px-3 py-1 text-[11px]'
              )}
            >
              <span className="text-[8px] font-extrabold uppercase tracking-wide text-emerald-400/90">
                Floor
              </span>
              {formatUnits(row.onHand)} {unit}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-950/40 font-bold text-amber-100',
                dense ? 'px-2 py-0.5 text-[10px]' : 'gap-1.5 px-3 py-1 text-[11px]'
              )}
            >
              <span className="text-[8px] font-extrabold uppercase tracking-wide text-amber-400/90">
                Prod
              </span>
              {formatUnits(row.kitchenPrepQty)} {unit}
            </span>
            {row.posSalesDays != null ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/35 bg-teal-950/40 px-3 py-1 text-[11px] font-bold tabular-nums text-teal-100"
                title={`${formatUnits(row.posSoldInWindow ?? 0)} ${unit} sold via POS in the last ${row.posSalesDays} days`}
              >
                <span className="text-[9px] font-extrabold uppercase tracking-wide text-teal-400/90">
                  Sold
                </span>
                {formatUnits(row.posSoldInWindow ?? 0)}
              </span>
            ) : null}
          </div>
        );

        const rowBody = (
          <div
            className={cn(
              operations
                ? dense
                  ? 'flex min-w-0 items-center gap-2 px-2.5 py-2'
                  : 'flex min-w-0 items-center gap-3 p-5'
                : 'flex flex-col gap-3 px-4 py-3 md:flex-row md:items-start',
              actionQueue &&
                !operations &&
                'rounded-xl border border-slate-800/90 bg-slate-900/50 md:rounded-none md:border-0 md:border-b md:border-slate-800/80 md:bg-transparent'
            )}
          >
            <div className="min-w-0 flex-1">
              <span
                className={cn(
                  'block truncate font-bold text-slate-50',
                  dense ? 'text-sm' : 'text-base'
                )}
              >
                {row.name}
              </span>
              {!dense ? (
                <span className="mt-1 block truncate text-xs text-slate-500">{row.supplier}</span>
              ) : null}

              {operations ? (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {location === 'retail_floor' ? (
                      <>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold',
                            shelf.warn
                              ? 'border-amber-500/40 bg-amber-950/40 text-amber-100'
                              : 'border-slate-700 bg-slate-950/80 text-slate-300'
                          )}
                        >
                          {shelf.warn ? <TriangleAlert className="h-3.5 w-3.5 shrink-0" /> : null}
                          {shelf.label}
                        </span>
                        {row.isMarkdown ? (
                          <span className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-200">
                            {row.markdownPct ? `${row.markdownPct}% off` : 'Markdown'}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="rounded-lg border border-slate-700 bg-slate-950/80 px-2.5 py-1 text-[11px] font-medium text-slate-400">
                        MAC {formatCurrency(row.unitCost)} / {unit} ·{' '}
                        {formatCurrency(qtyAtLocation * row.unitCost)} on hand
                      </span>
                    )}
                  </div>
                  {stockPills}
                  {location === 'retail_floor' && !dense ? (
                    <p className="mt-2 text-[11px] text-slate-400">
                      {row.retailPrice !== null ? (
                        <>Shelf {formatCurrency(row.retailPrice)} · </>
                      ) : null}
                      Margin {margin === null ? '—' : `${formatPercent(margin)}%`}
                      <span className="hidden sm:inline">
                        {' '}
                        · {casesLabel(row.onHandCases)} cases on floor
                      </span>
                    </p>
                  ) : null}
                </>
              ) : (
                <>
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
                            · Production: {formatUnits(row.kitchenPrepQty)} {unit}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <>
                        In production: {formatUnits(row.kitchenPrepQty)} {unit}
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
                          {row.markdownPct ? `${row.markdownPct}% off` : 'Markdown'}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </>
              )}

              {swipeEnabled ? (
                <p className="mt-2 text-[10px] font-semibold text-slate-500 md:hidden">
                  Swipe → production · ← waste
                </p>
              ) : null}
              {operations ? (
                dense ? (
                  <div
                    className="mt-1.5 flex items-center gap-2 text-slate-500"
                    aria-label="Transfer or waste via tap"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5 text-emerald-500/80" aria-hidden />
                    <Trash2 className="h-3.5 w-3.5 text-rose-500/80" aria-hidden />
                  </div>
                ) : (
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-emerald-500/80">
                    Tap to transfer · markdown · waste
                  </p>
                )
              ) : null}
            </div>
            {operations ? (
              <ChevronRight
                className={cn('shrink-0 text-slate-600', dense ? 'h-4 w-4' : 'h-5 w-5')}
                aria-hidden
              />
            ) : queueModalActions ? (
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-500/80 md:self-center">
                <span>Tap to transfer · markdown · waste</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              </div>
            ) : (
              <div className="min-w-0 w-full max-w-full md:max-w-md md:shrink-0">
                <SubInventoryTransferBar
                  row={stockLevelToTransferRow(row)}
                  staffId={staffId}
                  defaultQty={defaultQty}
                  variant={variant}
                  compact={compact}
                  layoutVariant={layoutVariant}
                  performMove={performMove}
                  busy={pendingId === row.productId}
                  onBusyChange={(b) => setPendingId(b ? row.productId : null)}
                  onSuccess={({ level, message }) => onSuccess(message, level)}
                  onError={onError}
                />
              </div>
            )}
          </div>
        );

        const operationsCard = (
          <button
            type="button"
            onClick={() => setModalProductId(row.productId)}
            className="w-full text-left transition hover:bg-slate-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          >
            {rowBody}
          </button>
        );

        return (
          <li
            key={row.productId}
            className={cn(
              operations &&
                'min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-800/90 bg-slate-950/60 shadow-sm',
              !actionQueue && !operations && 'border-b border-slate-800/80 last:border-b-0'
            )}
          >
            {operations ? (
              operationsCard
            ) : queueModalActions ? (
              <button
                type="button"
                onClick={() => setModalProductId(row.productId)}
                className="w-full text-left transition hover:bg-slate-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
              >
                {rowBody}
              </button>
            ) : swipeEnabled ? (
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
    {(operations || queueModalActions) && modalProductId ? (
      <OperationsTransferItemModal
        row={modalRow}
        location={location}
        pullDays={pullDays}
        staffId={staffId}
        performMove={performMove}
        busy={modalRow != null && pendingId === modalRow.productId}
        onBusyChange={(b) => setPendingId(b && modalRow ? modalRow.productId : null)}
        onClose={() => setModalProductId(null)}
        onSuccess={onSuccess}
        onError={onError}
      />
    ) : null}
    </>
  );
}
