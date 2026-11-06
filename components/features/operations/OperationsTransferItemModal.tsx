'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { useRole } from '@/components/auth/RoleProvider';
import { BundleDealModal } from '@/components/features/pricing/BundleDealModal';
import { FRESHLOOP_BUNDLE_PROMOS_UPDATED } from '@/components/features/pricing/SetBundlesListPanel';
import {
  SubInventoryTransferBar,
  type PerformInventoryMove,
  type TransferBarVariant,
} from '@/components/features/inventory/SubInventoryTransferBar';
import { stockLevelToTransferRow } from '@/lib/domains/inventory/inventoryMoveClient';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import { formatUnits, stockUnitLabel } from '@/lib/domains/receiving/yieldPricing';
import {
  RetailFloorItemCardMeta,
  type ItemBundlePromoHint,
} from '@/components/features/inventory/RetailFloorItemCardMeta';
import { suggestedPullQty } from '@/components/features/inventory/SubInventoryTransferList';
import { canManageBundleDeals } from '@/lib/auth/staffCapabilities';
import { ModalBody, ModalHeader, ModalShell } from '@/components/ui/layout';

export function OperationsTransferItemModal({
  row,
  location,
  pullDays: _pullDays,
  staffId,
  performMove,
  busy,
  onBusyChange,
  onClose,
  onSuccess,
  onError,
  bundlePromo,
}: {
  row: StockLevel | null;
  location: 'retail_floor' | 'kitchen_prep';
  /** `undefined` while floor bundle map is still loading. */
  bundlePromo?: ItemBundlePromoHint | null | undefined;
  pullDays: number;
  staffId?: string;
  performMove?: PerformInventoryMove;
  busy?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onClose: () => void;
  onSuccess: (message: string, level: StockLevel) => void;
  onError: (message: string) => void;
}) {
  const { activeUser } = useRole();
  const canManageBundles = canManageBundleDeals(activeUser?.role);
  const [mounted, setMounted] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [bundleModalOpen, setBundleModalOpen] = useState(false);
  const [bundleRemoving, setBundleRemoving] = useState(false);
  const [localBundle, setLocalBundle] = useState<ItemBundlePromoHint | null>(bundlePromo ?? null);
  const [closingAfterTransfer, setClosingAfterTransfer] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSavedMessageTimer = useCallback(() => {
    if (messageTimerRef.current) {
      clearTimeout(messageTimerRef.current);
      messageTimerRef.current = null;
    }
  }, []);

  const showSavedMessage = useCallback(
    (message: string, autoClearMs = 4000) => {
      clearSavedMessageTimer();
      setSavedMessage(message);
      if (autoClearMs <= 0) return;
      messageTimerRef.current = setTimeout(() => {
        messageTimerRef.current = null;
        setSavedMessage(null);
      }, autoClearMs);
    },
    [clearSavedMessageTimer]
  );

  useEffect(() => {
    if (bundlePromo === undefined) return;
    setLocalBundle(bundlePromo);
  }, [bundlePromo, row?.productId]);

  const scheduleCloseAfterSuccess = useCallback(
    (message: string, level: StockLevel) => {
      onSuccess(message, level);
      clearSavedMessageTimer();
      setSavedMessage(message);
      setClosingAfterTransfer(true);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        setClosingAfterTransfer(false);
        setSavedMessage(null);
        onClose();
      }, 1000);
    },
    [clearSavedMessageTimer, onClose, onSuccess]
  );

  const removeBundlePromo = useCallback(async () => {
    if (!localBundle?.id || !row) return;
    setBundleRemoving(true);
    try {
      const res = await fetch(
        `/api/admin/floor-bundle-promos?id=${encodeURIComponent(localBundle.id)}`,
        { method: 'DELETE' }
      );
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        onError(json.error ?? 'Could not remove bundle promo.');
        return;
      }
      setLocalBundle(null);
      window.dispatchEvent(new CustomEvent(FRESHLOOP_BUNDLE_PROMOS_UPDATED));
      showSavedMessage(`${row.name}: bundle removed from set list.`);
    } catch {
      onError('Could not remove bundle promo.');
    } finally {
      setBundleRemoving(false);
    }
  }, [localBundle, onError, row, showSavedMessage]);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setSavedMessage(null);
    setClosingAfterTransfer(false);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    clearSavedMessageTimer();
  }, [row?.productId, clearSavedMessageTimer]);

  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !closingAfterTransfer && !bundleModalOpen) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [row, onClose, closingAfterTransfer, bundleModalOpen]);

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
      ? suggestedPullQty(row)
      : Math.min(row.kitchenPrepQty, 1);
  const transferBusy = busy || bundleRemoving;

  return createPortal(
    <ModalShell
      open
      onClose={() => {
        if (!closingAfterTransfer && !bundleModalOpen) onClose();
      }}
      width="sm"
      zIndexClass="z-[200]"
      panelClassName="max-w-lg"
    >
        <ModalHeader className="px-5 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/90">
                {location === 'retail_floor' ? 'Retail floor transfer' : 'Production prep'}
              </p>
              <h2 id="operations-transfer-title" className="truncate text-lg font-black text-white">
                {row.name}
              </h2>
              <p className="mt-0.5 truncate text-xs text-slate-400">
                {row.supplier?.trim() ? row.supplier : 'Unassigned supplier'}
                {row.origin?.trim() ? (
                  <>
                    {' '}
                    · <span className="text-slate-500">Origin</span>{' '}
                    <span className="font-semibold text-slate-300">{row.origin.trim()}</span>
                  </>
                ) : null}
              </p>
            </div>
            <button
              type="button"
              onClick={closingAfterTransfer || bundleModalOpen ? undefined : onClose}
              disabled={closingAfterTransfer || bundleModalOpen}
              className="min-h-11 min-w-11 rounded-xl p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 disabled:opacity-40"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {location === 'retail_floor' ? (
            <RetailFloorItemCardMeta
              row={row}
              bundlePromo={localBundle}
              showBundleActions={canManageBundles && Boolean(localBundle?.id)}
              onEditBundle={() => setBundleModalOpen(true)}
              onRemoveBundle={() => void removeBundlePromo()}
              bundleActionsBusy={bundleRemoving}
            />
          ) : (
            <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              <div>
                <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Prod</dt>
                <dd className="font-mono font-bold tabular-nums text-amber-100">
                  {formatUnits(row.kitchenPrepQty)} {unit}
                </dd>
              </div>
              <div>
                <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Floor</dt>
                <dd className="font-mono font-bold tabular-nums text-emerald-200">
                  {formatUnits(row.onHand)} {unit}
                </dd>
              </div>
            </dl>
          )}
        </ModalHeader>
        <ModalBody className="px-5 py-4">
          {savedMessage ? (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/50 px-3 py-2.5 text-xs text-emerald-100">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <p>{savedMessage}</p>
            </div>
          ) : null}
          {bundleRemoving ? (
            <p className="mb-3 flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Removing bundle…
            </p>
          ) : null}
          <SubInventoryTransferBar
            row={stockLevelToTransferRow(row)}
            stockLevel={row}
            staffId={staffId}
            defaultQty={defaultQty}
            variant={variant}
            layoutVariant="operations"
            performMove={performMove}
            busy={transferBusy}
            onBusyChange={onBusyChange}
            onSuccess={({ level, message }) => scheduleCloseAfterSuccess(message, level)}
            onError={(message) => onError(message)}
            hideBundleCalcButton={canManageBundles && Boolean(localBundle?.id)}
            onOpenBundleEditor={() => setBundleModalOpen(true)}
          />
        </ModalBody>
      {canManageBundles && location === 'retail_floor' ? (
        <BundleDealModal
          open={bundleModalOpen}
          row={row}
          existingPromo={
            bundlePromo === undefined
              ? undefined
              : localBundle?.id
                ? {
                    id: localBundle.id,
                    minUnits: localBundle.minUnits,
                    bundlePrice: localBundle.bundlePrice,
                    label: localBundle.label ?? null,
                  }
                : null
          }
          onClose={() => setBundleModalOpen(false)}
          onSaved={(message, promo) => {
            setBundleModalOpen(false);
            if (promo) {
              setLocalBundle({
                id: promo.id,
                minUnits: promo.minUnits,
                bundlePrice: promo.bundlePrice,
                label: promo.label,
              });
            }
            showSavedMessage(message);
          }}
        />
      ) : null}
    </ModalShell>,
    document.body
  );
}
