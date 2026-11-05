'use client';

import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, ChevronRight, Trash2 } from 'lucide-react';
import { OperationsTransferItemModal } from '@/components/features/operations/OperationsTransferItemModal';
import {
  SubInventoryTransferBar,
  type PerformInventoryMove,
  type TransferBarVariant,
} from '@/components/features/inventory/SubInventoryTransferBar';
import {
  RetailFloorItemCardMeta,
  type ItemBundlePromoHint,
} from '@/components/features/inventory/RetailFloorItemCardMeta';
import { FRESHLOOP_BUNDLE_PROMOS_UPDATED } from '@/components/features/pricing/SetBundlesListPanel';
import { stockLevelToTransferRow } from '@/lib/domains/inventory/inventoryMoveClient';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import { formatCurrency, formatUnits, stockUnitLabel } from '@/lib/domains/receiving/yieldPricing';
import { useRole } from '@/components/auth/RoleProvider';
import { canManageBundleDeals, canViewSetBundlePromos } from '@/lib/auth/staffCapabilities';
import { cn } from '@/lib/utils/cn';

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
  const { activeUser } = useRole();
  const showBundleTools = canManageBundleDeals(activeUser?.role);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [modalProductId, setModalProductId] = useState<string | null>(null);
  const [bundleByProductId, setBundleByProductId] = useState<Map<string, ItemBundlePromoHint>>(
    () => new Map()
  );
  const [floorBundleMapReady, setFloorBundleMapReady] = useState(false);
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

  useEffect(() => {
    if (!canViewSetBundlePromos(activeUser?.role) || location !== 'retail_floor') return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const loadBundles = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void fetch('/api/admin/floor-bundle-promos', { cache: 'no-store' })
          .then((res) => res.json())
          .then((json) => {
            if (!json.success || !Array.isArray(json.promos)) return;
            const next = new Map<string, ItemBundlePromoHint>();
            for (const promo of json.promos as Array<{
              id: string;
              productId: string;
              minUnits: number;
              bundlePrice: number;
              label: string | null;
            }>) {
              next.set(promo.productId, {
                id: promo.id,
                minUnits: promo.minUnits,
                bundlePrice: promo.bundlePrice,
                label: promo.label,
              });
            }
            setBundleByProductId(next);
          })
          .catch(() => undefined)
          .finally(() => setFloorBundleMapReady(true));
      }, 250);
    };

    loadBundles();
    window.addEventListener(FRESHLOOP_BUNDLE_PROMOS_UPDATED, loadBundles);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener(FRESHLOOP_BUNDLE_PROMOS_UPDATED, loadBundles);
    };
  }, [activeUser?.role, location]);

  /** Action queue: tap row for qty, rescue, waste, and markdown in the transfer modal. */
  const queueModalActions = actionQueue && !operations && location === 'retail_floor';

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
        const unit = stockUnitLabel(row.unitType);
        const qtyAtLocation = location === 'retail_floor' ? row.onHand : row.kitchenPrepQty;
        const defaultQty =
          location === 'retail_floor' ? suggestedPullQty(row, pullDays) : Math.min(row.kitchenPrepQty, 1);

        const rowBody = (
          <div
            className={cn(
              operations
                ? dense
                  ? 'flex min-w-0 items-center gap-2 px-2.5 py-2'
                  : 'flex min-w-0 items-center gap-3 p-3 sm:p-5'
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
              {location !== 'retail_floor' ? (
                <span
                  className={cn(
                    'mt-0.5 block truncate text-slate-500',
                    dense ? 'text-[10px]' : 'text-xs'
                  )}
                  title={row.supplier}
                >
                  {row.supplier?.trim() ? row.supplier : 'Unassigned supplier'}
                </span>
              ) : null}

              {location === 'retail_floor' ? (
                <RetailFloorItemCardMeta
                  row={row}
                  dense={dense}
                  bundlePromo={bundleByProductId.get(row.productId) ?? null}
                />
              ) : operations ? (
                <div className={cn('min-w-0', dense ? 'mt-1 space-y-1' : 'mt-2 space-y-2')}>
                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                        Prod
                      </dt>
                      <dd className="font-mono font-bold tabular-nums text-amber-100">
                        {formatUnits(row.kitchenPrepQty)} {unit}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                        Floor
                      </dt>
                      <dd className="font-mono font-bold tabular-nums text-emerald-200">
                        {formatUnits(row.onHand)} {unit}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-[11px] text-slate-400">
                    MAC {formatCurrency(row.unitCost)} / {unit} ·{' '}
                    {formatCurrency(qtyAtLocation * row.unitCost)} on hand
                  </p>
                </div>
              ) : (
                <p className="mt-1 font-mono text-[11px] text-slate-300">
                  In production: {formatUnits(row.kitchenPrepQty)} {unit}
                  {row.onHand > 0 ? (
                    <span className="text-slate-400">
                      {' '}
                      · Floor: {formatUnits(row.onHand)} {unit}
                    </span>
                  ) : null}
                </p>
              )}

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
                    Tap to transfer · waste
                    {showBundleTools ? ' · bundle calc (owner / manager)' : ''}
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
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500/80 md:self-center">
                Tap row to transfer or log waste
              </p>
            ) : (
              <div className="min-w-0 w-full max-w-full md:max-w-md md:shrink-0">
                <SubInventoryTransferBar
                  row={stockLevelToTransferRow(row)}
                  stockLevel={row}
                  staffId={staffId}
                  defaultQty={defaultQty}
                  variant={variant}
                  compact={compact}
                  layoutVariant={layoutVariant}
                  performMove={performMove}
                  busy={pendingId === row.productId}
                  onBusyChange={(b) => setPendingId(b ? row.productId : null)}
                  onSuccess={({ level, message }) => onSuccess(message, level)}
                  onBundleSaved={(msg) => onSuccess(msg, row)}
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
        bundlePromo={
          modalRow && floorBundleMapReady
            ? bundleByProductId.get(modalRow.productId) ?? null
            : modalRow
              ? undefined
              : undefined
        }
      />
    ) : null}
    </>
  );
}
