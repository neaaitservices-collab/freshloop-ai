'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, X } from 'lucide-react';
import {
  SubInventoryTransferBar,
  type PerformInventoryMove,
  type TransferBarVariant,
} from '@/components/features/inventory/SubInventoryTransferBar';
import { stockLevelToTransferRow } from '@/lib/domains/inventory/inventoryMoveClient';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import { formatCurrency, formatPercent, formatUnits, stockUnitLabel } from '@/lib/domains/receiving/yieldPricing';
import { suggestedPullQty } from '@/components/features/inventory/SubInventoryTransferList';

export function OperationsTransferItemModal({
  row,
  location,
  pullDays,
  staffId,
  performMove,
  busy,
  onBusyChange,
  onClose,
  onSuccess,
  onError,
}: {
  row: StockLevel | null;
  location: 'retail_floor' | 'kitchen_prep';
  pullDays: number;
  staffId?: string;
  performMove?: PerformInventoryMove;
  busy?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onClose: () => void;
  onSuccess: (message: string, level: StockLevel) => void;
  onError: (message: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleCloseAfterSuccess = useCallback(
    (message: string, level: StockLevel) => {
      onSuccess(message, level);
      setSavedMessage(message);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        setSavedMessage(null);
        onClose();
      }, 1000);
    },
    [onClose, onSuccess]
  );

  useEffect(() => {
    setMounted(true);
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setSavedMessage(null);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, [row?.productId]);

  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !savedMessage) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [row, onClose, savedMessage]);

  useEffect(() => {
    if (!row) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [row]);

  if (!mounted || !row) return null;

  const unit = stockUnitLabel(row.unitType);
  const variant: TransferBarVariant = location === 'retail_floor' ? 'floor' : 'kitchen';
  const defaultQty =
    location === 'retail_floor'
      ? suggestedPullQty(row, pullDays)
      : Math.min(row.kitchenPrepQty, 1);
  const margin =
    row.retailPrice !== null && row.retailPrice > 0
      ? ((row.retailPrice - row.unitCost) / row.retailPrice) * 100
      : null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm"
        aria-label="Close"
        onClick={savedMessage ? undefined : onClose}
        disabled={Boolean(savedMessage)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="operations-transfer-title"
        className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
      >
        <header className="shrink-0 border-b border-slate-800 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/90">
                {location === 'retail_floor' ? 'Retail floor transfer' : 'Production prep'}
              </p>
              <h2 id="operations-transfer-title" className="truncate text-lg font-black text-white">
                {row.name}
              </h2>
              <p className="mt-0.5 truncate text-xs text-slate-400">{row.supplier}</p>
            </div>
            <button
              type="button"
              onClick={savedMessage ? undefined : onClose}
              disabled={Boolean(savedMessage)}
              className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 disabled:opacity-40"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border border-emerald-500/35 bg-emerald-950/50 px-2.5 py-0.5 font-bold text-emerald-200">
              Floor {formatUnits(row.onHand)} {unit}
            </span>
            <span className="rounded-full border border-amber-500/35 bg-amber-950/40 px-2.5 py-0.5 font-bold text-amber-100">
              Production {formatUnits(row.kitchenPrepQty)} {unit}
            </span>
          </div>
          {location === 'retail_floor' && row.retailPrice !== null ? (
            <p className="mt-2 text-[11px] text-slate-400">
              Shelf {formatCurrency(row.retailPrice)} · Margin{' '}
              {margin === null ? '—' : `${formatPercent(margin)}%`}
            </p>
          ) : null}
        </header>
        <div className="overflow-y-auto px-5 py-4">
          {savedMessage ? (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/50 px-3 py-2.5 text-xs text-emerald-100">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <p>{savedMessage}</p>
            </div>
          ) : null}
          <SubInventoryTransferBar
            row={stockLevelToTransferRow(row)}
            staffId={staffId}
            defaultQty={defaultQty}
            variant={variant}
            layoutVariant="operations"
            performMove={performMove}
            busy={busy || Boolean(savedMessage)}
            onBusyChange={onBusyChange}
            onSuccess={({ level, message }) => scheduleCloseAfterSuccess(message, level)}
            onError={(message) => onError(message)}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
