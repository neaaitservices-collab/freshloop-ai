'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, Calculator, Loader2, Minus, Plus, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { useRole } from '@/components/auth/RoleProvider';
import {
  BundleDealModal,
  type SavedBundlePromoPayload,
} from '@/components/features/pricing/BundleDealModal';
import { canManageBundleDeals } from '@/lib/auth/staffCapabilities';
import {
  executeInventoryMove,
  type InventoryMoveAction,
  type SubInventoryTransferRow,
  transferSuccessMessage,
} from '@/lib/domains/inventory/inventoryMoveClient';
import { createClientMutationId } from '@/lib/offline/queue';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import { formatCurrency, formatUnits, stockUnitLabel } from '@/lib/domains/receiving/yieldPricing';
import { numericInput } from '@/lib/security/numericInput';

export type TransferBarVariant = 'floor' | 'kitchen' | 'both';

export type PerformInventoryMove = (input: {
  productId: string;
  action: InventoryMoveAction;
  quantity?: number;
  staffId?: string;
  discountPct?: number;
  clientMutationId?: string;
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
  /** Full stock row for manager bundle-deal modal (floor SKUs). */
  stockLevel?: StockLevel | null;
  onBundleSaved?: (message: string) => void;
  /** When a saved bundle exists, hide calc (edit lives on the item header). */
  hideBundleCalcButton?: boolean;
  /** Parent-owned bundle editor (e.g. operations transfer modal). */
  onOpenBundleEditor?: () => void;
  /** Skip bundle modal GET when floor list already loaded this SKU. */
  bundlePromoHint?: SavedBundlePromoPayload | null;
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

const transferQtyInput = numericInput(z.number().finite().positive());

/** Blank, zero, and non-numeric text stay undefined. Never coerce them to 0. */
export function parseTransferQty(raw: string, max: number, step: number): number | undefined {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return undefined;
  const parsed = transferQtyInput.safeParse(trimmed);
  if (!parsed.success) return undefined;
  const next = clampTransferQty(parsed.data, max, step);
  return next > 0 ? next : undefined;
}

export function positiveTransferQty(value: number): number | undefined {
  return value > 0 ? value : undefined;
}

/** Floor waste opens a confirm step. It does not post. */
export function requestFloorWasteAction(
  quantity: number | undefined,
  busy: boolean
): { type: 'confirm'; quantity: number } | { type: 'blocked' } {
  if (busy || quantity == null || !(quantity > 0)) return { type: 'blocked' };
  return { type: 'confirm', quantity };
}

export function floorWasteConfirmDetails(input: {
  name: string;
  quantity: number;
  unit: string;
  unitCost?: number;
}): {
  item: string;
  quantityLabel: string;
  location: 'Floor';
  costLabel: string | null;
} {
  const unitCost = input.unitCost;
  const costKnown = unitCost != null && Number.isFinite(unitCost) && unitCost > 0;
  return {
    item: input.name,
    quantityLabel: `${formatUnits(input.quantity)} ${input.unit}`,
    location: 'Floor',
    costLabel: costKnown ? formatCurrency(unitCost * input.quantity) : null,
  };
}

const BLANK_QTY_ERROR = 'Enter a quantity. A blank field is not saved as zero.';
const INVALID_QTY_ERROR = 'Enter a quantity greater than zero.';

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
  value: number | undefined;
  max: number;
  step: number;
  unit: string;
  compact?: boolean;
  unified?: boolean;
  busy?: boolean;
  onChange: (n: number | undefined) => void;
}) {
  const errorId = useId();
  const focused = useRef(false);
  const [draft, setDraft] = useState(() => (value == null ? '' : String(value)));
  const [qtyError, setQtyError] = useState<string | null>(null);

  useEffect(() => {
    if (focused.current) return;
    setDraft(value == null ? '' : String(value));
    if (value != null && value > 0) setQtyError(null);
  }, [value, max]);

  if (!(max > 0)) return null;

  const publish = (raw: string) => {
    const next = parseTransferQty(raw, max, step);
    onChange(next);
    if (raw.trim() === '') setQtyError(BLANK_QTY_ERROR);
    else if (next == null) setQtyError(INVALID_QTY_ERROR);
    else setQtyError(null);
    return next;
  };

  const applyDraft = () => {
    const next = publish(draft);
    if (next != null) setDraft(String(next));
  };

  const stepper = (
    <>
      <button
        type="button"
        disabled={busy || value == null || value <= step}
        onClick={() => {
          if (value == null) return;
          const next = clampTransferQty(value - step, max, step);
          onChange(next > 0 ? next : undefined);
        }}
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
        aria-invalid={qtyError ? true : undefined}
        aria-errormessage={qtyError ? errorId : undefined}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => {
          const nextDraft = e.target.value;
          setDraft(nextDraft);
          const trimmed = nextDraft.trim().replace(',', '.');
          if (trimmed === '') {
            onChange(undefined);
            setQtyError(BLANK_QTY_ERROR);
            return;
          }
          const next = parseTransferQty(nextDraft, max, step);
          if (next == null) {
            onChange(undefined);
            setQtyError(null);
            return;
          }
          onChange(next);
          setQtyError(null);
        }}
        onBlur={() => {
          focused.current = false;
          applyDraft();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            applyDraft();
          }
        }}
        className={`min-h-11 border-0 bg-slate-950 text-center font-mono font-bold tabular-nums text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${
          unified ? 'w-[4.5rem] text-sm' : compact ? 'h-11 w-16 rounded-lg border border-slate-600 text-xs' : 'min-h-12 w-20 rounded-lg border border-slate-600 text-sm'
        }`}
        aria-label={`Quantity in ${unit}`}
      />
      <button
        type="button"
        disabled={busy || (value != null && value >= max)}
        onClick={() => {
          const next = clampTransferQty(value == null ? step : value + step, max, step);
          onChange(next > 0 ? next : undefined);
        }}
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
        onClick={() => onChange(max > 0 ? max : undefined)}
        className={`min-h-11 shrink-0 px-3 py-2 font-bold text-slate-300 hover:bg-slate-800/80 disabled:opacity-40 ${
          unified
            ? 'rounded-r-xl bg-slate-900/80 text-xs'
            : `rounded-lg border border-slate-700 text-slate-300 ${compact ? 'min-h-11 text-xs' : 'min-h-12 text-xs'}`
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
          unified ? 'text-xs' : compact ? 'w-full text-xs' : 'text-xs'
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
        <span className="text-xs font-medium text-slate-500">
          {unit} · max {formatUnits(max)}
        </span>
      ) : null}
      {qtyError ? (
        <p id={errorId} role="alert" className="text-xs font-semibold text-rose-300">
          {qtyError}
        </p>
      ) : null}
    </div>
  );
}

export function FloorWasteConfirm({
  item,
  quantityLabel,
  location,
  costLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  item: string;
  quantityLabel: string;
  location: string;
  costLabel: string | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3"
    >
      <p id={titleId} className="text-sm font-black text-rose-100">
        Confirm floor waste
      </p>
      <dl id={bodyId} className="mt-2 space-y-1 text-xs text-slate-200">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-400">Item</dt>
          <dd className="min-w-0 truncate text-right font-semibold text-white">{item}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-400">Qty</dt>
          <dd className="font-mono font-bold tabular-nums">{quantityLabel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-400">Location</dt>
          <dd>{location}</dd>
        </div>
        {costLabel ? (
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Cost</dt>
            <dd className="font-mono font-bold tabular-nums">{costLabel}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-rose-700 px-3 py-2 text-xs font-black text-white hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
        >
          Confirm waste
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
  layoutVariant = 'default',
  busy: busyProp,
  onBusyChange,
  performMove,
  onSuccess,
  onError,
  stockLevel = null,
  onBundleSaved,
  hideBundleCalcButton = false,
  onOpenBundleEditor,
  bundlePromoHint,
}: SubInventoryTransferBarProps) {
  const { activeUser } = useRole();
  const showBundleDeals = canManageBundleDeals(activeUser?.role);
  const [bundleModalOpen, setBundleModalOpen] = useState(false);
  const floorMax = row.onHand;
  const kitchenMax = row.kitchenPrepQty;
  const step = transferStepForUnit(row.unitType);
  const unit = stockUnitLabel(row.unitType);

  const initialFloorQty = useMemo(
    () => positiveTransferQty(clampTransferQty(defaultQty ?? step, floorMax, step)),
    [defaultQty, floorMax, step]
  );
  const [floorQty, setFloorQtyState] = useState<number | undefined>(initialFloorQty);
  const [kitchenQty, setKitchenQtyState] = useState<number | undefined>(() =>
    positiveTransferQty(clampTransferQty(step, kitchenMax, step))
  );
  const [wasteConfirm, setWasteConfirm] = useState<{ quantity: number } | null>(null);
  const [internalBusy, setInternalBusy] = useState(false);
  const floorQtyRef = useRef(floorQty);
  const kitchenQtyRef = useRef(kitchenQty);

  const busy = busyProp ?? internalBusy;

  const setFloorQty = (next: number | undefined) => {
    floorQtyRef.current = next;
    setFloorQtyState(next);
  };
  const setKitchenQty = (next: number | undefined) => {
    kitchenQtyRef.current = next;
    setKitchenQtyState(next);
  };

  const prevProductId = useRef(row.productId);
  useEffect(() => {
    if (prevProductId.current !== row.productId) {
      prevProductId.current = row.productId;
      setFloorQty(positiveTransferQty(clampTransferQty(defaultQty ?? step, floorMax, step)));
      return;
    }
    const current = floorQtyRef.current;
    if (current == null) return;
    setFloorQty(positiveTransferQty(clampTransferQty(current, floorMax, step)));
  }, [row.productId, floorMax, defaultQty, step]);

  useEffect(() => {
    const current = kitchenQtyRef.current;
    setKitchenQty(positiveTransferQty(clampTransferQty(current ?? step, kitchenMax, step)));
  }, [row.productId, kitchenMax, step]);

  useEffect(() => {
    setWasteConfirm((current) => {
      if (!current) return current;
      if (floorQty !== current.quantity) return null;
      return current;
    });
  }, [floorQty]);

  const setBusy = (value: boolean) => {
    setInternalBusy(value);
    onBusyChange?.(value);
  };

  const run = async (action: InventoryMoveAction, quantity: number) => {
    if (!(quantity > 0)) {
      onError?.('Enter a quantity greater than zero.');
      return;
    }
    if (busy) return;

    const clientMutationId = action === 'sale' ? createClientMutationId() : undefined;
    setBusy(true);
    try {
      if (performMove) {
        const outcome = await performMove({
          productId: row.productId,
          action,
          quantity,
          staffId,
          clientMutationId,
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

      const result = await executeInventoryMove({
        productId: row.productId,
        action,
        quantity,
        staffId,
        clientMutationId,
      });
      if (!result.success || !result.level) {
        onError?.(result.error ?? 'Transfer failed.');
        return;
      }
      onSuccess?.({
        action,
        level: result.level,
        message: transferSuccessMessage(action, row, result.level, result.units),
      });
    } finally {
      setBusy(false);
    }
  };

  const requestFloorWaste = () => {
    const decision = requestFloorWasteAction(floorQtyRef.current, busy);
    if (decision.type === 'blocked') return;
    setWasteConfirm({ quantity: decision.quantity });
  };

  const confirmFloorWaste = () => {
    if (!wasteConfirm || busy) return;
    const quantity = wasteConfirm.quantity;
    setWasteConfirm(null);
    void run('waste', quantity);
  };

  const postMove = (action: 'rescue' | 'sale' | 'kitchen_waste', quantity: number | undefined) => {
    if (quantity == null || !(quantity > 0)) return;
    void run(action, quantity);
  };

  const wasteDetails = wasteConfirm
    ? floorWasteConfirmDetails({
        name: row.name,
        quantity: wasteConfirm.quantity,
        unit,
        unitCost: row.unitCost,
      })
    : null;

  const showFloor = variant === 'floor' || variant === 'both';
  const showKitchen = variant === 'kitchen' || variant === 'both';
  const operations = layoutVariant === 'operations';

  const btnClass =
    'inline-flex min-h-12 min-w-12 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none';

  const compactBtn =
    'inline-flex min-h-11 min-w-11 flex-1 items-center justify-center gap-1 rounded-lg p-3 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50';

  const primaryBtn =
    'inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none';

  const secondaryBtn =
    'inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:min-h-12';

  const bundleBtn =
    'inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-amber-950/60 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:min-h-12';

  return (
    <div
      className={`flex min-w-0 w-full max-w-full flex-col gap-3 ${compact ? 'min-w-0 sm:min-w-[12rem]' : operations ? '' : 'rounded-xl border border-slate-800/80 bg-slate-950/50 p-3'}`}
    >
      {!compact && !operations ? (
        <div className="flex flex-wrap gap-2 text-xs font-mono">
          <span className="rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-2 py-1 text-emerald-300">
            Floor: {formatUnits(row.onHand)} {unit}
          </span>
          <span className="rounded-lg border border-amber-500/30 bg-amber-950/40 px-2 py-1 text-amber-200">
            Production: {formatUnits(row.kitchenPrepQty)} {unit}
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
                  disabled={busy || !(floorQty != null && floorQty > 0)}
                  onClick={() => postMove('rescue', floorQtyRef.current)}
                  className={`${primaryBtn} min-w-[8.5rem] bg-emerald-600 text-white shadow-md shadow-emerald-900/30 hover:bg-emerald-500`}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
                  To production
                </button>
              </div>
              <div className="flex min-w-0 flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !(floorQty != null && floorQty > 0)}
                  onClick={() => postMove('sale', floorQtyRef.current)}
                  className={`${secondaryBtn} min-w-[8.5rem] border-blue-800/60 bg-blue-950/40 text-blue-100 hover:bg-blue-900/50`}
                >
                  Record sale
                </button>
                <button
                  type="button"
                  disabled={busy || !(floorQty != null && floorQty > 0)}
                  onClick={requestFloorWaste}
                  className={`${secondaryBtn} min-w-[8.5rem] border-slate-700 bg-slate-900/50 text-slate-400 hover:border-rose-900/50 hover:bg-rose-950/30 hover:text-rose-300`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Floor waste
                </button>
                {showBundleDeals && stockLevel && !hideBundleCalcButton ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      onOpenBundleEditor ? onOpenBundleEditor() : setBundleModalOpen(true)
                    }
                    className={`${bundleBtn} min-w-[8.5rem]`}
                  >
                    <Calculator className="h-3.5 w-3.5" />
                    Bundle calc
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <div className={`flex flex-wrap gap-2 ${compact ? 'gap-1' : ''}`}>
              <button
                type="button"
                disabled={busy || !(floorQty != null && floorQty > 0)}
                onClick={() => postMove('rescue', floorQtyRef.current)}
                className={`${compact ? compactBtn : btnClass} bg-[#163832] text-[#7dcec4]`}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
                To production
              </button>
              <button
                type="button"
                disabled={busy || !(floorQty != null && floorQty > 0)}
                onClick={() => postMove('sale', floorQtyRef.current)}
                className={`${compact ? compactBtn : btnClass} bg-blue-900/40 text-blue-100`}
              >
                Record sale
              </button>
              <button
                type="button"
                disabled={busy || !(floorQty != null && floorQty > 0)}
                onClick={requestFloorWaste}
                className={`${compact ? compactBtn : btnClass} bg-[#C4847A]/15 text-[#C4847A]`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Floor waste
              </button>
              {showBundleDeals && stockLevel && !hideBundleCalcButton ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    onOpenBundleEditor ? onOpenBundleEditor() : setBundleModalOpen(true)
                  }
                  className={`${compact ? compactBtn : btnClass} border border-amber-500/35 bg-amber-950/50 text-amber-100`}
                >
                  <Calculator className="h-3.5 w-3.5" />
                  Bundle calc
                </button>
              ) : null}
            </div>
          )}
          {wasteDetails ? (
            <FloorWasteConfirm
              item={wasteDetails.item}
              quantityLabel={wasteDetails.quantityLabel}
              location={wasteDetails.location}
              costLabel={wasteDetails.costLabel}
              busy={busy}
              onCancel={() => setWasteConfirm(null)}
              onConfirm={confirmFloorWaste}
            />
          ) : null}
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
            disabled={busy || !(kitchenQty != null && kitchenQty > 0)}
            onClick={() => postMove('kitchen_waste', kitchenQtyRef.current)}
            className={`${compact ? compactBtn : btnClass} w-full border border-rose-500/40 bg-rose-950/50 text-rose-200`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Production waste
          </button>
        </div>
      ) : null}

      {busy && !performMove ? (
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Updating ledger…
        </span>
      ) : null}

      {showBundleDeals && stockLevel && !onOpenBundleEditor ? (
        <BundleDealModal
          open={bundleModalOpen}
          row={stockLevel}
          existingPromo={bundlePromoHint}
          onClose={() => setBundleModalOpen(false)}
          onSaved={onBundleSaved}
        />
      ) : null}
    </div>
  );
}
