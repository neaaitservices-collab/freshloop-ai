'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, Loader2, Minus, Plus, Tag, Trash2 } from 'lucide-react';
import {
  executeInventoryMove,
  type InventoryMoveAction,
  type SubInventoryTransferRow,
  transferSuccessMessage,
} from '@/lib/domains/inventory/inventoryMoveClient';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import { formatUnits, stockUnitLabel } from '@/lib/domains/receiving/yieldPricing';

export type TransferBarVariant = 'floor' | 'kitchen' | 'both';

export type PerformInventoryMove = (input: {
  productId: string;
  action: InventoryMoveAction;
  quantity?: number;
  staffId?: string;
  discountPct?: number;
  row: SubInventoryTransferRow;
}) => Promise<
  | { success: true; level: StockLevel; message: string }
  | { success: false; error: string }
>;

export interface SubInventoryTransferBarProps {
  row: SubInventoryTransferRow;
  staffId?: string;
  /** Suggested pull qty (e.g. from pull slider). */
  defaultQty?: number;
  variant?: TransferBarVariant;
  compact?: boolean;
  layoutVariant?: 'default' | 'operations';
  busy?: boolean;
  onBusyChange?: (busy: boolean) => void;
  /** Optimistic move (React 19); skips blocking ledger spinner when set. */
  performMove?: PerformInventoryMove;
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
  unified,
  busy,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  step: number;
  unit: string;
  compact?: boolean;
  unified?: boolean;
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

  const stepper = (
    <>
      <button
        type="button"
        disabled={busy || value <= step}
        onClick={() => onChange(clampTransferQty(value - step, max, step))}
        className={`flex min-h-11 min-w-11 items-center justify-center text-slate-200 disabled:opacity-40 ${
          unified
            ? 'rounded-l-xl border-r border-slate-700/80 bg-slate-900/80 px-3 hover:bg-slate-800'
            : `rounded-lg border border-slate-700 bg-slate-950 p-3 ${compact ? 'min-h-11 min-w-11' : 'min-h-12 min-w-12'}`
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
        className={`min-h-11 border-0 bg-slate-950 text-center font-mono font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${
          unified ? 'w-[4.5rem] text-sm' : compact ? 'h-11 w-16 rounded-lg border border-slate-600 text-xs' : 'min-h-12 w-20 rounded-lg border border-slate-600 text-sm'
        }`}
        aria-label={`Quantity in ${unit}`}
      />
      <button
        type="button"
        disabled={busy || value >= max}
        onClick={() => onChange(clampTransferQty(value + step, max, step))}
        className={`flex min-h-11 min-w-11 items-center justify-center text-slate-200 disabled:opacity-40 ${
          unified
            ? 'border-r border-slate-700/80 bg-slate-900/80 px-3 hover:bg-slate-800'
            : `rounded-lg border border-slate-700 bg-slate-950 p-3 ${compact ? 'min-h-11 min-w-11' : 'min-h-12 min-w-12'}`
        }`}
        aria-label="Increase quantity"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onChange(max)}
        className={`min-h-11 shrink-0 px-3 py-2 font-bold text-slate-300 hover:bg-slate-800/80 disabled:opacity-40 ${
          unified
            ? 'rounded-r-xl bg-slate-900/80 text-[11px]'
            : `rounded-lg border border-slate-700 text-slate-400 ${compact ? 'min-h-11 text-[10px]' : 'min-h-12 text-[11px]'}`
        }`}
      >
        All
      </button>
    </>
  );

  return (
    <div
      className={`flex flex-col gap-1.5 ${compact ? 'w-full' : ''}`}
      role="group"
      aria-label={`${label} in ${unit}`}
    >
      <span
        className={`font-bold uppercase tracking-wide text-slate-500 ${
          unified ? 'text-[10px]' : compact ? 'w-full text-[9px]' : 'text-[10px]'
        }`}
      >
        {label}
        {!unified ? ` (${unit}, max ${formatUnits(max)})` : null}
      </span>
      {unified ? (
        <div className="flex w-full max-w-full items-stretch overflow-hidden rounded-xl border border-slate-600/80 bg-slate-950 shadow-inner sm:max-w-xs">
          {stepper}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1">{stepper}</div>
      )}
      {unified ? (
        <span className="text-[10px] font-medium text-slate-500">
          {unit} · max {formatUnits(max)}
        </span>
      ) : null}
    </div>
  );
}

export function SubInventoryTransferBar({
  row,
  staffId,
  defaultQty,
  variant = 'both',
  compact = false,
  layoutVariant = 'default',
  busy: busyProp,
  onBusyChange,
  performMove,
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

  const [selectedDiscount, setSelectedDiscount] = useState<number>(30);
  const [showDiscountPicker, setShowDiscountPicker] = useState<boolean>(false);

  const busy = busyProp ?? internalBusy;

  const prevProductId = useRef(row.productId);
  useEffect(() => {
    if (prevProductId.current !== row.productId) {
      prevProductId.current = row.productId;
      setFloorQty(clampTransferQty(defaultQty ?? step, floorMax, step));
      return;
    }
    setFloorQty((current) => clampTransferQty(current, floorMax, step));
  }, [row.productId, floorMax, defaultQty, step]);

  useEffect(() => {
    setKitchenQty((current) => clampTransferQty(current || step, kitchenMax, step));
  }, [row.productId, kitchenMax, step]);

  const setBusy = (value: boolean) => {
    setInternalBusy(value);
    onBusyChange?.(value);
  };

  const run = async (action: InventoryMoveAction, quantity: number, discountOverride?: number) => {
    if (action !== 'markdown' && !(quantity > 0)) {
      onError?.('Enter a quantity greater than zero.');
      return;
    }

    const discountPct = discountOverride ?? selectedDiscount;

    if (performMove) {
      const outcome = await performMove({
        productId: row.productId,
        action,
        quantity,
        staffId,
        discountPct,
        row,
      });
      if (outcome.success) {
        onSuccess?.({
          action,
          level: outcome.level,
          message: outcome.message,
        });
      } else {
        onError?.(outcome.error);
      }
      return;
    }

    setBusy(true);
    const result = await executeInventoryMove({
      productId: row.productId,
      action,
      quantity,
      staffId,
      discountPct,
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
  const operations = layoutVariant === 'operations';

  const btnClass =
    'inline-flex min-h-12 min-w-12 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none';

  const compactBtn =
    'inline-flex min-h-11 min-w-11 flex-1 items-center justify-center gap-1 rounded-lg p-3 text-[10px] font-black disabled:cursor-not-allowed disabled:opacity-50';

  const primaryBtn =
    'inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none';

  const secondaryBtn =
    'inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none';

  const markdownControl = (
    <div className="relative flex min-w-0 flex-[1_1_11rem] items-stretch overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900/40">
      <button
        type="button"
        disabled={busy}
        onClick={() => void run('markdown', floorQty, selectedDiscount)}
        className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 px-3 font-bold text-slate-300 hover:bg-slate-800/60 disabled:opacity-40 ${
          operations ? 'text-[11px]' : compact ? 'min-h-9 px-2.5 py-1 text-[11px]' : 'min-h-11 px-3 py-1.5 text-xs text-amber-300'
        }`}
        title={`Apply ${selectedDiscount}% markdown to shelf price`}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Tag className="h-3.5 w-3.5 text-amber-400/90" />}
        <span className="truncate">{row.isMarkdown ? `Update ${selectedDiscount}%` : `${selectedDiscount}% off`}</span>
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setShowDiscountPicker((prev) => !prev)}
        className="flex min-h-10 items-center justify-center border-l border-slate-700/80 px-2 text-[10px] font-bold text-slate-400 hover:bg-slate-800/60"
        title="Select discount percentage: 10%, 20%, 25%, 30%"
        aria-label="Change discount percentage"
      >
        ▼
      </button>
      {showDiscountPicker ? (
        <div className="absolute top-full right-0 z-30 mt-1 flex gap-1 rounded-xl border border-slate-700 bg-slate-900/95 p-1.5 shadow-xl backdrop-blur-md">
          {[10, 20, 25, 30].map((pct) => (
            <button
              key={pct}
              type="button"
              disabled={busy}
              onClick={() => {
                setSelectedDiscount(pct);
                setShowDiscountPicker(false);
                void run('markdown', floorQty, pct);
              }}
              className={`min-h-8 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                selectedDiscount === pct
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'bg-slate-800/80 text-amber-200 hover:bg-slate-700/80 hover:text-white'
              }`}
            >
              {pct}%
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      className={`flex min-w-0 w-full max-w-full flex-col gap-3 ${compact ? 'min-w-0 sm:min-w-[12rem]' : operations ? '' : 'rounded-xl border border-slate-800/80 bg-slate-950/50 p-3'}`}
    >
      {!compact && !operations ? (
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
        <div className="flex flex-col gap-3">
          <TransferQtyPicker
            label={operations ? 'Quantity' : 'Floor amount'}
            value={floorQty}
            max={floorMax}
            step={step}
            unit={unit}
            compact={compact}
            unified={operations}
            busy={busy}
            onChange={setFloorQty}
          />
          {operations ? (
            <>
              <div className="flex min-w-0 flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || floorQty <= 0}
                  onClick={() => void run('rescue', floorQty)}
                  className={`${primaryBtn} min-w-[8.5rem] bg-emerald-600 text-white shadow-md shadow-emerald-900/30 hover:bg-emerald-500`}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
                  To production
                </button>
              </div>
              <div className="flex min-w-0 flex-wrap gap-2">
                {markdownControl}
                <button
                  type="button"
                  disabled={busy || floorQty <= 0}
                  onClick={() => void run('waste', floorQty)}
                  className={`${secondaryBtn} min-w-[8.5rem] border-slate-700 bg-slate-900/50 text-slate-400 hover:border-rose-900/50 hover:bg-rose-950/30 hover:text-rose-300`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Floor waste
                </button>
              </div>
            </>
          ) : (
            <div className={`flex flex-wrap gap-2 ${compact ? 'gap-1' : ''}`}>
              <button
                type="button"
                disabled={busy || floorQty <= 0}
                onClick={() => void run('rescue', floorQty)}
                className={`${compact ? compactBtn : btnClass} bg-[#163832] text-[#7dcec4]`}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
                To production
              </button>
              {markdownControl}
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
          )}
        </div>
      ) : null}

      {showKitchen && kitchenMax > 0 ? (
        <div className="flex flex-col gap-2">
          <TransferQtyPicker
            label={operations ? 'Quantity' : 'Production amount'}
            value={kitchenQty}
            max={kitchenMax}
            step={step}
            unit={unit}
            compact={compact}
            unified={operations}
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

      {busy && !performMove ? (
        <span className="flex items-center gap-1 text-[10px] text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Updating ledger…
        </span>
      ) : null}
    </div>
  );
}
