'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Loader2, Minus, Plus, Tag, Trash2 } from 'lucide-react';
import {
  executeInventoryMove,
  type InventoryMoveAction,
  type SubInventoryTransferRow,
  transferSuccessMessage,
} from '@/lib/inventoryMoveClient';
import type { StockLevel } from '@/lib/stock';
import { formatUnits, stockUnitLabel } from '@/lib/yieldPricing';

export type TransferBarVariant = 'floor' | 'kitchen' | 'both';

export interface SubInventoryTransferBarProps {
  row: SubInventoryTransferRow;
  staffId?: string;
  /** Suggested pull qty (e.g. from pull slider). */
  defaultQty?: number;
  variant?: TransferBarVariant;
  compact?: boolean;
  busy?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onSuccess?: (payload: { action: InventoryMoveAction; level: StockLevel; message: string }) => void;
  onError?: (message: string) => void;
}

/** Step size for +/- and input based on product unit type. */
export function transferStepForUnit(unitType: string): number {
  const u = unitType.toUpperCase();
  if (u === 'LBS' || u === 'LB' || u === 'KG') return 0.25;
  if (u === 'L' || u === 'QUART' || u === 'GALLON') return 0.5;
  return 1;
}

export function clampTransferQty(value: number, max: number, step: number): number {
  if (!Number.isFinite(value) || max <= 0) return 0;
  const min = step;
  const clamped = Math.min(max, Math.max(min, value));
  const fractionDigits = step < 1 ? 2 : 0;
  return Number(clamped.toFixed(fractionDigits));
}

function parseQtyInput(raw: string, max: number, step: number): number {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return 0;
  return clampTransferQty(Number(trimmed), max, step);
}

function TransferQtyPicker({
  label,
  value,
  max,
  step,
  unit,
  compact,
  busy,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  step: number;
  unit: string;
  compact?: boolean;
  busy?: boolean;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(() => String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value, max]);

  if (!(max > 0)) return null;

  const applyDraft = () => {
    const next = parseQtyInput(draft, max, step);
    if (next > 0) onChange(next);
    else setDraft(String(value));
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 ${compact ? 'w-full' : ''}`}
      role="group"
      aria-label={`${label} in ${unit}`}
    >
      <span
        className={`font-bold uppercase tracking-wide text-slate-500 ${
          compact ? 'w-full text-[9px]' : 'text-[10px]'
        }`}
      >
        {label} ({unit}, max {formatUnits(max)})
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={busy || value <= step}
          onClick={() => onChange(clampTransferQty(value - step, max, step))}
          className={`flex items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-slate-200 disabled:opacity-40 ${
            compact ? 'h-7 w-7' : 'h-8 w-8'
          }`}
          aria-label="Decrease quantity"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <input
          type="number"
          inputMode="decimal"
          min={step}
          max={max}
          step={step}
          disabled={busy}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={applyDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              applyDraft();
            }
          }}
          className={`rounded-lg border border-slate-600 bg-slate-950 text-center font-mono font-bold text-white focus:border-emerald-500 focus:outline-none ${
            compact ? 'h-7 w-16 text-xs' : 'h-8 w-20 text-sm'
          }`}
          aria-label={`Quantity in ${unit}`}
        />
        <button
          type="button"
          disabled={busy || value >= max}
          onClick={() => onChange(clampTransferQty(value + step, max, step))}
          className={`flex items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-slate-200 disabled:opacity-40 ${
            compact ? 'h-7 w-7' : 'h-8 w-8'
          }`}
          aria-label="Increase quantity"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onChange(max)}
          className={`rounded-lg border border-slate-700 font-bold text-slate-400 ${
            compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]'
          }`}
        >
          All
        </button>
      </div>
    </div>
  );
}

export function SubInventoryTransferBar({
  row,
  staffId,
  defaultQty,
  variant = 'both',
  compact = false,
  busy: busyProp,
  onBusyChange,
  onSuccess,
  onError,
}: SubInventoryTransferBarProps) {
  const floorMax = row.onHand;
  const kitchenMax = row.kitchenPrepQty;
  const step = transferStepForUnit(row.unitType);
  const unit = stockUnitLabel(row.unitType);

  const initialFloorQty = useMemo(
    () => clampTransferQty(defaultQty ?? step, floorMax, step),
    [defaultQty, floorMax, step, row.productId]
  );
  const [floorQty, setFloorQty] = useState(initialFloorQty);
  const [kitchenQty, setKitchenQty] = useState(() => clampTransferQty(step, kitchenMax, step));
  const [internalBusy, setInternalBusy] = useState(false);

  const busy = busyProp ?? internalBusy;

  useEffect(() => {
    setFloorQty(clampTransferQty(defaultQty ?? step, floorMax, step));
  }, [row.productId, floorMax, defaultQty, step]);

  useEffect(() => {
    setKitchenQty((current) => clampTransferQty(current || step, kitchenMax, step));
  }, [row.productId, kitchenMax, step]);

  const setBusy = (value: boolean) => {
    setInternalBusy(value);
    onBusyChange?.(value);
  };

  const run = async (action: InventoryMoveAction, quantity: number) => {
    if (!(quantity > 0)) {
      onError?.('Enter a quantity greater than zero.');
      return;
    }
    setBusy(true);
    const result = await executeInventoryMove({
      productId: row.productId,
      action,
      quantity,
      staffId,
    });
    setBusy(false);
    if (!result.success || !result.level) {
      onError?.(result.error ?? 'Transfer failed.');
      return;
    }
    onSuccess?.({
      action,
      level: result.level,
      message: transferSuccessMessage(action, row, result.level, result.units),
    });
  };

  const showFloor = variant === 'floor' || variant === 'both';
  const showKitchen = variant === 'kitchen' || variant === 'both';

  const btnClass =
    'inline-flex h-10 min-w-[5.5rem] flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none';

  const compactBtn =
    'inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-[10px] font-black disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div
      className={`flex flex-col gap-2 ${compact ? 'min-w-[12rem]' : 'rounded-xl border border-slate-800/80 bg-slate-950/50 p-3'}`}
    >
      {!compact ? (
        <div className="flex flex-wrap gap-2 text-[11px] font-mono">
          <span className="rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-2 py-1 text-emerald-300">
            Floor: {formatUnits(row.onHand)} {unit}
          </span>
          <span className="rounded-lg border border-amber-500/30 bg-amber-950/40 px-2 py-1 text-amber-200">
            Kitchen: {formatUnits(row.kitchenPrepQty)} {unit}
          </span>
        </div>
      ) : null}

      {showFloor && floorMax > 0 ? (
        <div className="flex flex-col gap-2">
          <TransferQtyPicker
            label="Floor amount"
            value={floorQty}
            max={floorMax}
            step={step}
            unit={unit}
            compact={compact}
            busy={busy}
            onChange={setFloorQty}
          />
          <div className={`flex flex-wrap gap-2 ${compact ? 'gap-1' : ''}`}>
            <button
              type="button"
              disabled={busy || floorQty <= 0}
              onClick={() => void run('rescue', floorQty)}
              className={`${compact ? compactBtn : btnClass} bg-[#163832] text-[#7dcec4]`}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
              To kitchen
            </button>
            <button
              type="button"
              disabled={busy || Boolean(row.isMarkdown)}
              onClick={() => void run('markdown', floorQty)}
              className={`${compact ? compactBtn : btnClass} bg-amber-500/15 text-amber-300`}
              title="Applies 30% markdown to shelf price (full line)"
            >
              <Tag className="h-3.5 w-3.5" />
              30% off
            </button>
            <button
              type="button"
              disabled={busy || floorQty <= 0}
              onClick={() => void run('waste', floorQty)}
              className={`${compact ? compactBtn : btnClass} bg-[#C4847A]/15 text-[#C4847A]`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Floor waste
            </button>
          </div>
        </div>
      ) : null}

      {showKitchen && kitchenMax > 0 ? (
        <div className="flex flex-col gap-2">
          <TransferQtyPicker
            label="Kitchen amount"
            value={kitchenQty}
            max={kitchenMax}
            step={step}
            unit={unit}
            compact={compact}
            busy={busy}
            onChange={setKitchenQty}
          />
          <button
            type="button"
            disabled={busy || kitchenQty <= 0}
            onClick={() => void run('kitchen_waste', kitchenQty)}
            className={`${compact ? compactBtn : btnClass} w-full border border-rose-500/40 bg-rose-950/50 text-rose-200`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Kitchen waste
          </button>
        </div>
      ) : null}

      {busy ? (
        <span className="flex items-center gap-1 text-[10px] text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Updating ledger…
        </span>
      ) : null}
    </div>
  );
}
