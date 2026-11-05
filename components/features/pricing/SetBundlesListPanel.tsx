'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Package, Trash2 } from 'lucide-react';
import { ScrollTable } from '@/components/ui/layout';
import { formatCurrency, formatPercent } from '@/lib/domains/receiving/yieldPricing';
import {
  BUNDLE_MARGIN_ALERT_PCT,
  bundleMarginDisplayClass,
  isBundleMarginBelowAlert,
} from '@/lib/domains/pricing/bundleDealEconomics';
import { BUNDLE_DEALS_ROLE_HINT } from '@/lib/auth/staffCapabilities';
import type { FloorBundlePromoView } from '@/lib/domains/pricing/floorBundlePromoTypes';
import { cn } from '@/lib/utils/cn';

export const FRESHLOOP_BUNDLE_PROMOS_UPDATED = 'freshloop-bundle-promos-updated';

function promoLabel(promo: FloorBundlePromoView): string {
  return `${promo.minUnits} for ${formatCurrency(promo.bundlePrice)}`;
}

function profitPctLabel(promo: FloorBundlePromoView): string {
  const { marginPct } = promo.economics;
  if (marginPct == null) return '—';
  return `${formatPercent(marginPct)}%`;
}

function ProfitPctCell({ promo }: { promo: FloorBundlePromoView }) {
  const { marginPct, marginTone } = promo.economics;
  const belowAlert = isBundleMarginBelowAlert(marginPct);
  const isLoss = marginTone === 'loss' || (marginPct != null && marginPct < 0);

  return (
    <div className="flex flex-col items-end gap-1 sm:items-end">
      <span
        className={cn(
          'font-mono text-sm font-black tabular-nums',
          bundleMarginDisplayClass(marginPct, marginTone)
        )}
      >
        {profitPctLabel(promo)}
      </span>
      {belowAlert ? (
        <span
          className={cn(
            'inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
            isLoss
              ? 'border border-rose-500/40 bg-rose-950/50 text-rose-200'
              : 'border border-amber-500/40 bg-amber-950/50 text-amber-100'
          )}
        >
          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
          {isLoss ? 'Below cost' : `< ${BUNDLE_MARGIN_ALERT_PCT}%`}
        </span>
      ) : null}
    </div>
  );
}

export type SetBundlesListPanelProps = {
  /** Floor staff: view promos for signage; no edit or margin tooling. */
  readOnly?: boolean;
};

export function SetBundlesListPanel({ readOnly = false }: SetBundlesListPanelProps) {
  const [promos, setPromos] = useState<FloorBundlePromoView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch('/api/admin/floor-bundle-promos', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(
          json.error ??
            json.message ??
            (res.status === 403
              ? readOnly
                ? 'Could not load set bundles.'
                : BUNDLE_DEALS_ROLE_HINT
              : 'Could not load set bundles.')
        );
        setPromos([]);
        return;
      }
      setPromos(json.promos ?? []);
    } catch {
      setError('Could not load set bundles.');
    } finally {
      setLoading(false);
    }
  }, [readOnly]);

  const showProfitColumn = !readOnly;

  useEffect(() => {
    void load();
    const onUpdate = () => void load({ silent: true });
    window.addEventListener(FRESHLOOP_BUNDLE_PROMOS_UPDATED, onUpdate);
    return () => window.removeEventListener(FRESHLOOP_BUNDLE_PROMOS_UPDATED, onUpdate);
  }, [load]);

  const lowMarginPromos = useMemo(
    () => promos.filter((p) => isBundleMarginBelowAlert(p.economics.marginPct)),
    [promos]
  );

  const remove = async (id: string) => {
    setRemovingId(id);
    try {
      const res = await fetch(`/api/admin/floor-bundle-promos?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Could not remove bundle.');
        return;
      }
      setPromos((current) => current.filter((p) => p.id !== id));
    } catch {
      setError('Could not remove bundle.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-amber-300" />
          <div>
            <h2 className="text-sm font-black text-white">Set bundles</h2>
            <p className="text-[11px] text-slate-400">
              {readOnly
                ? 'Promos from owner / manager · use for shelf signage (not POS)'
                : 'Owner & store manager · item · promo · profit % · signage only (not POS)'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-11 rounded-xl border border-slate-700 px-3 text-xs font-bold text-slate-300 hover:bg-slate-800"
        >
          Refresh
        </button>
      </header>

      <div className="p-4 sm:p-5">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading set bundles…
          </p>
        ) : error ? (
          <p className="text-sm text-rose-200">{error}</p>
        ) : promos.length === 0 ? (
          <p className="text-sm text-slate-400">
            {readOnly
              ? 'No bundle promos saved yet. Ask a manager to add them from Operations.'
              : (
                  <>
                    No bundles saved yet. Use{' '}
                    <span className="font-semibold text-amber-200">Bundle calc</span> on a floor item
                    and tap <span className="font-semibold text-emerald-300">Save to list</span>.
                  </>
                )}
          </p>
        ) : (
          <>
            {showProfitColumn && lowMarginPromos.length > 0 ? (
              <div
                className="mb-4 flex gap-3 rounded-xl border border-amber-500/35 bg-amber-950/35 px-3 py-3 sm:px-4"
                role="alert"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
                <div className="min-w-0 text-xs leading-relaxed text-amber-100/95">
                  <p className="font-bold text-amber-50">
                    {lowMarginPromos.length === 1
                      ? '1 bundle is under the profit floor'
                      : `${lowMarginPromos.length} bundles are under the profit floor`}
                  </p>
                  <p className="mt-1 text-amber-100/80">
                    Target at least{' '}
                    <span className="font-mono font-bold tabular-nums">{BUNDLE_MARGIN_ALERT_PCT}%</span>{' '}
                    profit on promo price. Review{' '}
                    {lowMarginPromos
                      .slice(0, 3)
                      .map((p) => p.productName)
                      .join(', ')}
                    {lowMarginPromos.length > 3 ? ` +${lowMarginPromos.length - 3} more` : ''} before
                    printing signage.
                  </p>
                </div>
              </div>
            ) : null}

            {/* Mobile: card stack */}
            <ul className="space-y-2 md:hidden">
              {promos.map((promo) => {
                const belowAlert = isBundleMarginBelowAlert(promo.economics.marginPct);
                return (
                  <li
                    key={promo.id}
                    className={cn(
                      'rounded-xl border border-slate-800 bg-slate-950/60 p-3',
                      belowAlert && 'border-amber-500/35 bg-amber-950/25'
                    )}
                  >
                    <p
                      className="truncate text-sm font-bold text-slate-100"
                      title={promo.productName}
                    >
                      {promo.productName}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                      <div className="min-w-0 col-span-2 sm:col-span-1">
                        <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                          Promo
                        </dt>
                        <dd className="font-mono text-sm font-bold tabular-nums text-amber-100">
                          {promoLabel(promo)}
                        </dd>
                      </div>
                      {showProfitColumn ? (
                        <div>
                          <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                            Profit %
                          </dt>
                          <dd className="mt-0.5">
                            <ProfitPctCell promo={promo} />
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                    {!readOnly ? (
                      <button
                        type="button"
                        disabled={removingId === promo.id}
                        onClick={() => void remove(promo.id)}
                        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 text-xs font-bold text-slate-400 hover:border-rose-900/50 hover:bg-rose-950/40 hover:text-rose-300 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {/* Desktop: aligned table */}
            <ScrollTable className="hidden md:block">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <tr className="border-b border-slate-800">
                    <th className="px-3 py-2.5 font-bold">Item</th>
                    <th className="px-3 py-2.5 font-bold">Promo</th>
                    {showProfitColumn ? (
                      <th className="px-3 py-2.5 text-right font-bold">Profit %</th>
                    ) : null}
                    {!readOnly ? <th className="w-14 px-2 py-2.5" aria-label="Actions" /> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {promos.map((promo) => {
                    const belowAlert = isBundleMarginBelowAlert(promo.economics.marginPct);
                    return (
                      <tr
                        key={promo.id}
                        className={cn(belowAlert && 'bg-amber-950/10')}
                      >
                        <td className="max-w-[16rem] px-3 py-3">
                          <p className="truncate font-semibold text-slate-100" title={promo.productName}>
                            {promo.productName}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-sm font-bold tabular-nums text-amber-100">
                          {promoLabel(promo)}
                        </td>
                        {showProfitColumn ? (
                          <td className="px-3 py-3">
                            <ProfitPctCell promo={promo} />
                          </td>
                        ) : null}
                        {!readOnly ? (
                          <td className="px-2 py-3 text-right">
                            <button
                              type="button"
                              disabled={removingId === promo.id}
                              onClick={() => void remove(promo.id)}
                              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-700 text-slate-400 hover:border-rose-900/50 hover:bg-rose-950/40 hover:text-rose-300 disabled:opacity-50"
                              aria-label={`Remove ${promo.productName} bundle`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollTable>
          </>
        )}
      </div>
    </section>
  );
}
