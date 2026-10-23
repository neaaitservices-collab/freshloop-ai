'use client';

import React, { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import {
  SubInventoryTransferBar,
  type TransferBarVariant,
} from '@/components/inventory/SubInventoryTransferBar';
import { stockLevelToTransferRow } from '@/lib/inventoryMoveClient';
import type { StockLevel } from '@/lib/stock';
import { formatCurrency, formatPercent, formatUnits, stockUnitLabel } from '@/lib/yieldPricing';

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
  emptyMessage,
  onSuccess,
  onError,
}: {
  rows: StockLevel[];
  location: 'retail_floor' | 'kitchen_prep';
  pullDays?: number;
  staffId?: string;
  compact?: boolean;
  emptyMessage: string;
  onSuccess: (message: string, level: StockLevel) => void;
  onError: (message: string) => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const variant = transferVariantForTab(location);

  if (rows.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-slate-400">{emptyMessage}</p>;
  }

  return (
    <ul>
      {rows.map((row) => {
        const margin = storedMargin(row);
        const shelf = shelfCue(row.daysRemaining);
        const unit = stockUnitLabel(row.unitType);
        const qtyAtLocation = location === 'retail_floor' ? row.onHand : row.kitchenPrepQty;

        return (
          <li
            key={row.productId}
            className="flex flex-col gap-3 border-b border-slate-800/80 px-4 py-3 last:border-b-0 sm:flex-row sm:items-start"
          >
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-slate-100">{row.name}</span>
              <span className="mt-0.5 block truncate text-[11px] text-slate-500">{row.supplier}</span>
              <span className="mt-1 block font-mono text-[11px] text-slate-300">
                {location === 'retail_floor' ? (
                  <>
                    On floor: {formatUnits(row.onHand)} {unit} / {casesLabel(row.onHandCases)} cases
                    {row.kitchenPrepQty > 0 ? (
                      <span className="text-emerald-400/90">
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
                <span className="mt-0.5 block text-[11px] text-slate-400">
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
                  {shelf.warn ? <TriangleAlert className="h-3 w-3" /> : null}
                  {shelf.label}
                  {row.isMarkdown ? (
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-200">
                      30% off
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
            <div className="w-full sm:max-w-md sm:shrink-0">
              <SubInventoryTransferBar
                row={stockLevelToTransferRow(row)}
                staffId={staffId}
                defaultQty={
                  location === 'retail_floor' ? suggestedPullQty(row, pullDays) : Math.min(row.kitchenPrepQty, 1)
                }
                variant={variant}
                compact={compact}
                busy={pendingId === row.productId}
                onBusyChange={(b) => setPendingId(b ? row.productId : null)}
                onSuccess={({ level, message }) => onSuccess(message, level)}
                onError={onError}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
