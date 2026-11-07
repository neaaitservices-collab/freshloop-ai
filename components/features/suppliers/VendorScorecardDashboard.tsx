'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ScrollTable } from '@/components/ui/layout';
import type {
  PriceVarianceAlertRow,
  SupplierScorecard,
  VendorAnalyticsBundle,
} from '@/lib/domains/suppliers/vendorAnalyticsTypes';

type AnalyticsResponse =
  | { success: true; analytics: VendorAnalyticsBundle }
  | { success?: false; error?: string };

function reliabilityBadge(score: number) {
  if (score >= 85) return { variant: 'success' as const, label: 'Strong' };
  if (score >= 70) return { variant: 'warning' as const, label: 'Watch' };
  return { variant: 'destructive' as const, label: 'At risk' };
}

function fmtPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}

export function VendorScorecardDashboard({ canView }: { canView: boolean }) {
  const [lookbackDays, setLookbackDays] = useState(30);
  const [bundle, setBundle] = useState<VendorAnalyticsBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ lookbackDays: String(lookbackDays) });
      const res = await fetch(`/api/admin/suppliers/analytics?${qs}`, { cache: 'no-store' });
      const json = (await res.json()) as AnalyticsResponse;
      if (!res.ok || !json.success || !('analytics' in json)) {
        setError('error' in json && json.error ? json.error : 'Could not load vendor analytics.');
        setBundle(null);
        return;
      }
      setBundle(json.analytics);
    } catch {
      setError('Network error loading vendor analytics.');
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, [canView, lookbackDays]);

  useEffect(() => {
    void load();
  }, [load]);

  const scorecards = bundle?.scorecards ?? [];
  const alerts = bundle?.recentPriceAlerts ?? [];

  const summary = useMemo(() => {
    if (!bundle || scorecards.length === 0) return null;
    const avgRel =
      scorecards.reduce((sum, row) => sum + row.reliabilityScore, 0) / scorecards.length;
    return {
      avgReliability: Number(avgRel.toFixed(1)),
      alertCount: alerts.length,
      threshold: bundle.priceAlertThresholdPct,
    };
  }, [alerts.length, bundle, scorecards]);

  if (!canView) return null;

  return (
    <section className="space-y-6" aria-busy={loading}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400/90">
            Vendor intelligence
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">Scorecards &amp; price alerts</h2>
          <p className="mt-1 max-w-xl text-sm text-slate-400">
            OCR discrepancy rates, not-received lines, arrival spoilage, and invoice cost spikes vs
            moving averages.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[14, 30, 60].map((days) => (
            <button
              key={days}
              type="button"
              className={`min-h-[44px] rounded-xl border px-4 text-sm font-medium transition ${
                lookbackDays === days
                  ? 'border-emerald-700/60 bg-emerald-950/40 text-emerald-300'
                  : 'border-slate-800 bg-slate-900/80 text-slate-300 hover:border-slate-700'
              }`}
              onClick={() => setLookbackDays(days)}
            >
              {days}d window
            </button>
          ))}
          <button
            type="button"
            className="min-h-[44px] rounded-xl border border-slate-800 bg-slate-900/80 px-4 text-sm text-slate-300 hover:border-slate-700"
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      {summary ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Avg reliability
              </p>
            </CardHeader>
            <CardBody className="px-4 pb-4">
              <p className="font-mono text-3xl tabular-nums text-slate-100">{summary.avgReliability}</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader className="px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Price alerts
              </p>
            </CardHeader>
            <CardBody className="px-4 pb-4">
              <p className="font-mono text-3xl tabular-nums text-amber-300">{summary.alertCount}</p>
              <p className="mt-1 text-xs text-slate-500">
                Threshold &gt;{summary.threshold}% vs benchmark
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader className="px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Vendors scored
              </p>
            </CardHeader>
            <CardBody className="px-4 pb-4">
              <p className="font-mono text-3xl tabular-nums text-slate-100">{scorecards.length}</p>
            </CardBody>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-col gap-1 border-b border-slate-800/80 px-4 py-4 sm:px-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Supplier scorecards
          </p>
          <p className="text-sm text-slate-500">Sorted by reliability (lowest first).</p>
        </CardHeader>
        <CardBody className="p-0">
          <ScrollTable>
            <table className="min-w-[720px] w-full text-left text-sm">
              <thead className="border-b border-slate-800/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 sm:px-6">Vendor</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3 text-right">OCR low</th>
                  <th className="px-4 py-3 text-right">Discrepancy</th>
                  <th className="px-4 py-3 text-right">Price spikes</th>
                  <th className="px-4 py-3 text-right">Spoilage</th>
                  <th className="px-4 py-3 text-right">Invoices</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {scorecards.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500 sm:px-6">
                      {loading ? 'Loading analytics…' : 'No vendor activity in this window yet.'}
                    </td>
                  </tr>
                ) : (
                  scorecards.map((row: SupplierScorecard) => {
                    const rel = reliabilityBadge(row.reliabilityScore);
                    return (
                      <tr key={row.supplierId} className="hover:bg-slate-800/30">
                        <td className="max-w-[200px] px-4 py-3 sm:px-6">
                          <p className="truncate font-medium text-slate-200" title={row.supplierName}>
                            {row.supplierName}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-mono tabular-nums text-slate-100">
                              {row.reliabilityScore}
                            </span>
                            <Badge variant={rel.variant}>{rel.label}</Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-300">
                          {fmtPct(row.ocrLowConfidenceRate)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-300">
                          {fmtPct(row.discrepancyRate)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-mono tabular-nums text-slate-300">
                            {fmtPct(row.priceVarianceRate)}
                          </span>
                          {row.avgPriceVariancePct != null ? (
                            <p className="text-[10px] text-slate-500">
                              avg {row.avgPriceVariancePct.toFixed(1)}%
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-rose-300/90">
                          {fmtPct(row.spoilageRate)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-400">
                          {row.invoiceCount}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </ScrollTable>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="border-b border-slate-800/80 px-4 py-4 sm:px-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Flagged price variances
          </p>
        </CardHeader>
        <CardBody className="p-0">
          <ScrollTable>
            <table className="min-w-[640px] w-full text-left text-sm">
              <thead className="border-b border-slate-800/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 sm:px-6">When</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 text-right">Scanned</th>
                  <th className="px-4 py-3 text-right">Benchmark</th>
                  <th className="px-4 py-3 text-right">Δ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {alerts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500 sm:px-6">
                      No price spikes over threshold in this window.
                    </td>
                  </tr>
                ) : (
                  alerts.map((row: PriceVarianceAlertRow) => (
                    <tr key={row.id} className="hover:bg-slate-800/30">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 sm:px-6">
                        {new Date(row.createdAt).toLocaleDateString()}
                      </td>
                      <td className="max-w-[140px] truncate px-4 py-3 text-slate-300" title={row.supplierName}>
                        {row.supplierName}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-3 text-slate-200" title={row.itemName}>
                        {row.itemName}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-200">
                        ${row.scannedUnitCost.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-400">
                        ${row.benchmarkCost.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant="warning">+{row.variancePct.toFixed(1)}%</Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ScrollTable>
        </CardBody>
      </Card>
    </section>
  );
}
