'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, Loader2, Minus, Plus, X } from 'lucide-react';
import { FRESHLOOP_BUNDLE_PROMOS_UPDATED } from '@/components/features/pricing/SetBundlesListPanel';
import { ModalBody, ModalFooter, ModalHeader, ModalShell } from '@/components/ui/layout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import { BUNDLE_DEALS_ROLE_HINT } from '@/lib/auth/staffCapabilities';
import {
  BUNDLE_MARGIN_ALERT_PCT,
  bundleMarginDisplayClass,
  computeBundleDealEconomics,
  isBundleMarginBelowAlert,
} from '@/lib/domains/pricing/bundleDealEconomics';
import { formatCurrency, formatPercent } from '@/lib/domains/receiving/yieldPricing';
import { cn } from '@/lib/utils/cn';

export type SavedBundlePromoPayload = {
  id: string;
  minUnits: number;
  bundlePrice: number;
  label: string | null;
};

type BundleDealModalProps = {
  open: boolean;
  row: StockLevel | null;
  onClose: () => void;
  onSaved?: (message: string, promo?: SavedBundlePromoPayload) => void;
  /**
   * When defined, form is seeded locally (no GET ?productId=).
   * `undefined` = still unknown — fetch once. `null` = no saved promo.
   */
  existingPromo?: SavedBundlePromoPayload | null;
};

/** Manager-only bundle margin calculator — does not change POS, prices, or ledger. */
function seedFormFromPromo(
  row: StockLevel,
  promo: SavedBundlePromoPayload | null,
  setMinUnits: (n: number) => void,
  setBundlePriceDraft: (s: string) => void
) {
  if (promo) {
    setMinUnits(Math.max(2, Math.floor(promo.minUnits)));
    setBundlePriceDraft(String(promo.bundlePrice));
    return;
  }
  setMinUnits(2);
  if (row.retailPrice != null && row.retailPrice > 0) {
    setBundlePriceDraft(String(Number((row.retailPrice * 2 * 0.85).toFixed(2))));
  } else {
    setBundlePriceDraft('');
  }
}

export function BundleDealModal({ open, row, onClose, onSaved, existingPromo }: BundleDealModalProps) {
  const [minUnits, setMinUnits] = useState(2);
  const [bundlePriceDraft, setBundlePriceDraft] = useState('');
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !row) return;
    setError(null);

    if (existingPromo !== undefined) {
      seedFormFromPromo(row, existingPromo, setMinUnits, setBundlePriceDraft);
      setLoadingSaved(false);
      return;
    }

    setMinUnits(2);
    setBundlePriceDraft('');
    setLoadingSaved(true);
    void fetch(`/api/admin/floor-bundle-promos?productId=${encodeURIComponent(row.productId)}`, {
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((json) => {
        const promo = json.success && json.promo ? (json.promo as SavedBundlePromoPayload) : null;
        seedFormFromPromo(row, promo, setMinUnits, setBundlePriceDraft);
      })
      .catch(() => {
        seedFormFromPromo(row, null, setMinUnits, setBundlePriceDraft);
      })
      .finally(() => setLoadingSaved(false));
  }, [open, row, existingPromo]);

  const bundlePrice = Number(bundlePriceDraft.replace(',', '.'));
  const economics = useMemo(() => {
    if (!row || !Number.isFinite(bundlePrice) || bundlePrice <= 0) return null;
    return computeBundleDealEconomics({
      minUnits,
      bundlePrice,
      unitCost: row.unitCost,
      regularUnitPrice: row.regularRetailPrice ?? row.retailPrice,
    });
  }, [row, minUnits, bundlePrice]);

  const marginClass = economics
    ? bundleMarginDisplayClass(economics.marginPct, economics.marginTone)
    : 'text-emerald-300';

  const handleSaveToList = async () => {
    if (!row || !Number.isFinite(bundlePrice) || bundlePrice <= 0 || minUnits < 2) {
      setError('Enter at least 2 units and a promo price greater than zero.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/floor-bundle-promos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: row.productId,
          minUnits,
          bundlePrice,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
        promo?: SavedBundlePromoPayload;
      };
      if (!res.ok || !json.success) {
        setError(
          json.error ??
            json.message ??
            (res.status === 403 ? BUNDLE_DEALS_ROLE_HINT : 'Could not save to set bundles list.')
        );
        return;
      }
      window.dispatchEvent(new CustomEvent(FRESHLOOP_BUNDLE_PROMOS_UPDATED));
      const marginLabel =
        economics?.marginPct != null ? `${formatPercent(economics.marginPct)}% margin` : 'margin n/a';
      const msg = `${row.name}: saved ${minUnits} for ${formatCurrency(bundlePrice)} (${marginLabel})`;
      const promoPayload =
        json.promo != null
          ? {
              id: json.promo.id,
              minUnits: json.promo.minUnits,
              bundlePrice: json.promo.bundlePrice,
              label: json.promo.label ?? null,
            }
          : undefined;
      onSaved?.(msg, promoPayload);
      onClose();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  if (!row) return null;

  return (
    <ModalShell open={open} onClose={onClose} width="md" zIndexClass="z-[220]">
      <ModalHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400/90">
              Bundle calculator · owner / store manager
            </p>
            <h2 className="truncate text-lg font-black text-white">{row.name}</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Preview margin for a multi-unit promo — nothing is saved or sent to POS.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </ModalHeader>

      <ModalBody className="space-y-4">
        {loadingSaved ? (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading saved promo for this SKU…
          </p>
        ) : null}

        <div className="rounded-xl border border-amber-500/30 bg-amber-950/25 px-3 py-2.5 text-[11px] leading-relaxed text-amber-100/90">
          Calculator only. Apply the sign price on the floor and ring individual SKUs at the register —
          FreshLoop does not discount POS automatically yet.
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-400">
          <p>
            Unit cost{' '}
            <span className="font-mono font-bold text-slate-200">
              {formatCurrency(row.unitCost)}
            </span>
            {row.retailPrice != null ? (
              <>
                {' '}
                · Shelf{' '}
                <span className="font-mono text-slate-200">
                  {formatCurrency(row.retailPrice)}
                </span>
              </>
            ) : null}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Units in bundle (2+)
            </span>
            <div className="mt-2 flex items-stretch overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
              <button
                type="button"
                disabled={minUnits <= 2}
                onClick={() => setMinUnits((n) => Math.max(2, n - 1))}
                className="flex min-h-12 min-w-12 items-center justify-center text-slate-200 disabled:opacity-40"
                aria-label="Decrease units"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="flex min-h-12 flex-1 items-center justify-center font-mono text-lg font-black text-white tabular-nums">
                {minUnits}
              </span>
              <button
                type="button"
                disabled={minUnits >= 99}
                onClick={() => setMinUnits((n) => Math.min(99, n + 1))}
                className="flex min-h-12 min-w-12 items-center justify-center text-slate-200 disabled:opacity-40"
                aria-label="Increase units"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Promo price ($)
            </span>
            <Input
              inputMode="decimal"
              value={bundlePriceDraft}
              onChange={(e) => setBundlePriceDraft(e.target.value)}
              className="mt-2 font-mono tabular-nums"
              placeholder="e.g. 8.00"
            />
          </label>
        </div>

        {economics?.marginTone === 'loss' ? (
          <p className="rounded-xl border border-rose-500/40 bg-rose-950/35 px-3 py-2 text-xs text-rose-100">
            Promo price is below total cost — you can still save for signage, but margin is negative.
          </p>
        ) : economics && isBundleMarginBelowAlert(economics.marginPct) ? (
          <p className="rounded-xl border border-amber-500/40 bg-amber-950/35 px-3 py-2 text-xs text-amber-100">
            Profit margin is under{' '}
            <span className="font-mono font-bold tabular-nums">{BUNDLE_MARGIN_ALERT_PCT}%</span> — consider
            raising the promo price before printing signage.
          </p>
        ) : null}

        {economics ? (
          <div className="space-y-2 rounded-2xl border border-slate-700/80 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-bold text-white">
                {economics.minUnits} for {formatCurrency(economics.bundlePrice)}
              </p>
              <p className={cn('font-mono text-sm font-black tabular-nums', marginClass)}>
                {economics.marginPct == null ? '—' : `${formatPercent(economics.marginPct)}% margin`}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
              <div>
                <dt className="uppercase tracking-wide">COGS (bundle)</dt>
                <dd className="font-mono font-bold text-slate-200 tabular-nums">
                  {formatCurrency(economics.cogsTotal)}
                </dd>
              </div>
              <div>
                <dt className="uppercase tracking-wide">Profit $</dt>
                <dd className="font-mono font-bold text-slate-200 tabular-nums">
                  {formatCurrency(economics.bundlePrice - economics.cogsTotal)}
                </dd>
              </div>
              <div>
                <dt className="uppercase tracking-wide">Effective / unit</dt>
                <dd className="font-mono font-bold text-slate-200 tabular-nums">
                  {formatCurrency(economics.effectiveUnitPrice)}
                </dd>
              </div>
              {economics.regularTotal != null ? (
                <>
                  <div>
                    <dt className="uppercase tracking-wide">Regular total</dt>
                    <dd className="font-mono text-slate-300 tabular-nums">
                      {formatCurrency(economics.regularTotal)}
                    </dd>
                  </div>
                  <div>
                    <dt className="uppercase tracking-wide">Customer saves</dt>
                    <dd className="font-mono text-emerald-300/90 tabular-nums">
                      {economics.savingsVsRegular != null && economics.savingsVsRegular > 0
                        ? formatCurrency(economics.savingsVsRegular)
                        : '—'}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Enter a promo price to see margin.</p>
        )}

        {error ? (
          <p className="rounded-xl border border-rose-900/50 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-200">
            {error}
          </p>
        ) : null}
      </ModalBody>

      <ModalFooter>
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onClose} disabled={saving}>
            Close
          </Button>
          <Button
            type="button"
            variant="success"
            className="w-full border-emerald-500/40 bg-emerald-500 font-black text-slate-950 hover:bg-emerald-400 sm:w-auto"
            disabled={saving || !Number.isFinite(bundlePrice) || bundlePrice <= 0 || minUnits < 2}
            onClick={() => void handleSaveToList()}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Calculator className="h-4 w-4" />
                Save to list
              </>
            )}
          </Button>
        </div>
      </ModalFooter>
    </ModalShell>
  );
}
