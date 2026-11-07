'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ScrapBucketSettingsModal } from '@/components/features/admin/ScrapBucketSettingsModal';
import { AlertOctagon, Info, Loader2, Settings2, ShieldCheck } from 'lucide-react';
import type { WasteKpiReport } from '@/lib/domains/inventory/ledger';
import { formatCurrency } from '@/lib/domains/receiving/yieldPricing';
import { MIN_GROSS_SALES_FOR_WASTE_RATIO } from '@/lib/domains/stats/wasteKpi';
import { cn } from '@/lib/utils/cn';
import { WasteFormulaBreakdown } from '@/components/features/admin/WasteFormulaBreakdown';
import { DashboardCard } from '@/components/features/admin/DashboardCard';

function impliedWastePct(totalWaste: number, sales: number): number | null {
  if (!Number.isFinite(sales) || sales <= 0 || totalWaste <= 0) return null;
  return Number(Math.min(999.99, (totalWaste / sales) * 100).toFixed(1));
}

function formatRatioDisplay(pct: number): string {
  if (pct > 100) return '>100%';
  return `${pct.toFixed(1)}%`;
}

export function WasteSemaphoreCard({
  wasteKpi,
  goalPct,
  refreshing = false,
  className,
}: {
  wasteKpi: WasteKpiReport | null;
  /** From store settings when KPI still loading */
  goalPct?: number;
  refreshing?: boolean;
  className?: string;
}) {
  const [scrapModalOpen, setScrapModalOpen] = useState(false);
  const target = wasteKpi?.targetWastePct ?? goalPct ?? 2.5;
  const bucketCount = wasteKpi?.volumetricScrapBucketsCount ?? 0;
  const wastePct = wasteKpi?.wastePct ?? null;
  const discard = wasteKpi?.totalDiscardValue ?? 0;
  const scrap = wasteKpi?.volumetricScrapValue ?? 0;
  const sales = wasteKpi?.grossSalesRevenue ?? 0;
  const totalWaste = wasteKpi?.totalWasteValue ?? discard + scrap;
  const implied = wastePct === null ? impliedWastePct(totalWaste, sales) : null;
  const salesShort = sales > 0 && sales < MIN_GROSS_SALES_FOR_WASTE_RATIO;
  const salesRemaining = Math.max(0, MIN_GROSS_SALES_FOR_WASTE_RATIO - sales);
  const over =
    wastePct != null
      ? (wasteKpi?.isExceedingTarget ?? wastePct > target)
      : !salesShort && implied != null
        ? implied > target
        : false;

  const scaleMax = Math.max(target * 1.5, target + 5, 10);
  const barPct =
    wastePct != null
      ? Math.min(100, (wastePct / scaleMax) * 100)
      : implied != null
        ? Math.min(100, (implied / scaleMax) * 100)
        : 0;

  const displayPct =
    wastePct != null
      ? formatRatioDisplay(wastePct)
      : implied != null && !salesShort
        ? formatRatioDisplay(implied)
        : wastePct === 0
          ? '0.0%'
          : '—';

  return (
    <DashboardCard
      className={cn(
        'flex min-h-0 flex-col',
        over ? 'border-rose-900/45' : 'border-slate-800/90',
        className
      )}
      aria-label="Waste traffic light"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  wastePct != null
                    ? over
                      ? 'animate-pulse bg-rose-500 shadow-[0_0_8px_2px_rgba(244,63,94,0.7)]'
                      : 'bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.6)]'
                    : salesShort
                      ? 'bg-amber-400 shadow-[0_0_8px_2px_rgba(251,191,36,0.5)]'
                      : implied != null
                        ? over
                          ? 'bg-rose-500 shadow-[0_0_8px_2px_rgba(244,63,94,0.7)]'
                          : 'bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.6)]'
                        : 'bg-slate-600'
                )}
                aria-hidden
              />
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Waste semáforo
              </p>
              {salesShort ? (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                  Preview
                </span>
              ) : null}
            </div>

            {refreshing && !wasteKpi ? (
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                Updating…
              </div>
            ) : (
              <div className="mt-2 flex items-baseline gap-2.5">
                <p
                  className={cn(
                    'font-mono text-4xl font-black tabular-nums tracking-tight sm:text-5xl',
                    wastePct != null
                      ? over
                        ? 'text-rose-400'
                        : 'text-emerald-400'
                      : salesShort && implied != null
                        ? 'text-amber-300'
                        : implied != null
                          ? over
                            ? 'text-rose-400'
                            : 'text-emerald-400'
                          : wastePct === 0
                            ? 'text-emerald-400'
                            : 'text-slate-500'
                  )}
                >
                  {displayPct}
                </p>
                { (wastePct != null && wastePct > 100) || (implied != null && implied > 100) ? (
                  <span className="text-xs font-medium text-slate-400">
                    (Waste exceeds POS sales)
                  </span>
                ) : null}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Target
            </p>
            <p className="font-mono text-sm font-bold text-amber-300">
              ≤ {target.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="relative">
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-950 ring-1 ring-slate-800">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  over || (implied != null && implied > target)
                    ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                    : 'bg-emerald-500'
                )}
                style={{ width: `${barPct}%` }}
              />
            </div>
            <div
              className="absolute -top-0.5 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-amber-400"
              style={{ left: `${Math.min(98, (target / scaleMax) * 100)}%` }}
              title={`Goal ${target}%`}
            />
          </div>
          <div className="flex justify-between text-[11px] font-mono text-slate-500">
            <span>0%</span>
            <span className="text-amber-400/90">Goal {target.toFixed(1)}%</span>
            <span>{scaleMax.toFixed(0)}%+</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 px-3.5 py-2.5 text-xs leading-relaxed text-slate-300">
          {wastePct != null ? (
            over ? (
              <span className="inline-flex items-start gap-2 font-medium text-rose-300/95">
                <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {(wastePct - target).toFixed(1)} pts above goal — prioritize floor rescue on{' '}
                  <Link
                    href="/operations"
                    className="font-bold text-rose-200 underline-offset-2 hover:underline"
                  >
                    Operations
                  </Link>
                  .
                </span>
              </span>
            ) : (
              <span className="inline-flex items-start gap-2 text-emerald-300/90">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{(target - wastePct).toFixed(1)} pts under goal. Great job!</span>
              </span>
            )
          ) : salesShort && implied != null ? (
            <div className="flex items-start gap-2 text-slate-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div>
                <p className="font-medium text-slate-200">
                  Waiting for {formatCurrency(salesRemaining)} more in POS sales
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Official Waste % unlocks at ${MIN_GROSS_SALES_FOR_WASTE_RATIO} in sales (currently{' '}
                  <span className="font-mono text-slate-200">{formatCurrency(sales)}</span>).{' '}
                  <Link
                    href="/admin/settings#waste-pulls"
                    className="font-semibold text-emerald-400 underline-offset-2 hover:underline"
                  >
                    Edit goal
                  </Link>
                </p>
              </div>
            </div>
          ) : sales <= 0 ? (
            'Log POS sales in the ledger to compute waste %.'
          ) : (
            'No waste recorded yet for this period.'
          )}
        </div>

        <WasteFormulaBreakdown
          layout="stacked"
          discard={discard}
          scrap={scrap}
          sales={sales}
          bucketCount={bucketCount}
          scrapInputs={wasteKpi?.scrapBucketInputs ?? null}
        />

        {bucketCount > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-3 text-xs text-slate-500">
            <button
              type="button"
              onClick={() => setScrapModalOpen(true)}
              className="inline-flex items-center gap-1.5 font-semibold text-emerald-400/90 transition-colors hover:text-emerald-300"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Adjust bucket cost defaults
            </button>
            <Link
              href="/admin/settings#kitchen-scrap"
              className="font-medium text-slate-400 underline-offset-2 hover:text-slate-300 hover:underline"
            >
              Full settings →
            </Link>
          </div>
        ) : null}
      </div>

      <ScrapBucketSettingsModal
        open={scrapModalOpen}
        onClose={() => setScrapModalOpen(false)}
        bucketCount={bucketCount}
      />
    </DashboardCard>
  );
}
