'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ScrapBucketSettingsModal } from '@/components/features/admin/ScrapBucketSettingsModal';
import { AlertOctagon, Loader2, ShieldCheck } from 'lucide-react';
import type { WasteKpiReport } from '@/lib/domains/inventory/ledger';
import { formatCurrency } from '@/lib/domains/receiving/yieldPricing';
import { MIN_GROSS_SALES_FOR_WASTE_RATIO } from '@/lib/domains/stats/wasteKpi';
import { cn } from '@/lib/utils/cn';
import { WasteFormulaBreakdown } from '@/components/features/admin/WasteFormulaBreakdown';

function impliedWastePct(totalWaste: number, sales: number): number | null {
  if (!Number.isFinite(sales) || sales <= 0 || totalWaste <= 0) return null;
  return Number(Math.min(999.99, (totalWaste / sales) * 100).toFixed(1));
}

export function WasteSemaphoreCard({
  wasteKpi,
  goalPct,
  refreshing = false,
}: {
  wasteKpi: WasteKpiReport | null;
  /** From store settings when KPI still loading */
  goalPct?: number;
  refreshing?: boolean;
}) {
  const [scrapModalOpen, setScrapModalOpen] = useState(false);
  const target = wasteKpi?.targetWastePct ?? goalPct ?? 2.5;
  const bucketCount = wasteKpi?.volumetricScrapBucketsCount ?? 0;
  const wastePct = wasteKpi?.wastePct ?? null;
  const over = wasteKpi?.isExceedingTarget ?? false;
  const discard = wasteKpi?.totalDiscardValue ?? 0;
  const scrap = wasteKpi?.volumetricScrapValue ?? 0;
  const sales = wasteKpi?.grossSalesRevenue ?? 0;
  const totalWaste = wasteKpi?.totalWasteValue ?? discard + scrap;
  const implied = wastePct === null ? impliedWastePct(totalWaste, sales) : null;
  const salesShort = sales > 0 && sales < MIN_GROSS_SALES_FOR_WASTE_RATIO;

  const barPct =
    wastePct != null
      ? Math.min(100, (wastePct / Math.max(target * 1.5, target + 5)) * 100)
      : implied != null
        ? Math.min(100, (implied / Math.max(target * 1.5, target + 5)) * 100)
        : 0;

  const scaleMax = Math.max(target * 1.5, target + 5, 10);

  return (
    <article
      className={cn(
        'rounded-2xl border bg-slate-900/60 p-4 sm:p-5',
        over ? 'border-rose-900/45' : 'border-slate-800'
      )}
      aria-label="Waste traffic light"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
        {/* Primary readout */}
        <div className="flex min-w-[10rem] flex-col justify-center lg:w-48 lg:shrink-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'h-2.5 w-2.5 rounded-full',
                over ? 'bg-rose-500 shadow-[0_0_8px_2px_rgba(244,63,94,0.7)]' : 'bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.6)]'
              )}
              aria-hidden
            />
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Waste vs goal
            </p>
          </div>

          {refreshing && !wasteKpi ? (
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Updating…
            </div>
          ) : (
            <>
              <p
                className={cn(
                  'mt-1 font-mono text-4xl font-black tabular-nums tracking-tight sm:text-[2.75rem]',
                  wastePct != null
                    ? over
                      ? 'text-rose-400'
                      : 'text-emerald-400'
                    : 'text-slate-500'
                )}
              >
                {wastePct != null ? `${wastePct.toFixed(2)}%` : '—'}
              </p>
              <p className="text-xs font-bold text-slate-400">
                Goal ≤ <span className="text-slate-200">{target.toFixed(1)}%</span>
              </p>
            </>
          )}
        </div>

        {/* Formula + bar */}
        <div className="min-w-0 flex-1 space-y-3">
          <WasteFormulaBreakdown
            discard={discard}
            scrap={scrap}
            sales={sales}
            bucketCount={bucketCount}
            scrapInputs={wasteKpi?.scrapBucketInputs ?? null}
          />

          <div className="relative pt-1">
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-950 ring-1 ring-slate-800">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  over ? 'bg-gradient-to-r from-amber-500 to-rose-500' : 'bg-emerald-500'
                )}
                style={{ width: `${barPct}%` }}
              />
            </div>
            <div
              className="absolute top-0 h-2.5 w-0.5 -translate-x-1/2 bg-amber-400/90"
              style={{ left: `${Math.min(98, (target / scaleMax) * 100)}%` }}
              title={`Goal ${target}%`}
            />
            <div className="mt-1 flex justify-between text-[10px] font-mono text-slate-500">
              <span>0%</span>
              <span className="text-amber-400/90">Goal {target.toFixed(1)}%</span>
              <span>{scaleMax.toFixed(0)}%+</span>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-slate-400">
            {wastePct != null ? (
              over ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-rose-300/95">
                  <AlertOctagon className="h-3.5 w-3.5 shrink-0" />
                  {(wastePct - target).toFixed(2)} pts above goal — prioritize floor rescue on{' '}
                  <Link href="/operations" className="font-bold text-rose-200 underline-offset-2 hover:underline">
                    Operations
                  </Link>
                  .
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-emerald-300/90">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                  {(target - wastePct).toFixed(2)} pts under goal.
                </span>
              )
            ) : salesShort && implied != null ? (
              <>
                Official % stays hidden until POS sales reach ${MIN_GROSS_SALES_FOR_WASTE_RATIO}{' '}
                (now {formatCurrency(sales)}). Unofficial ratio:{' '}
                <strong className="font-mono text-slate-200">{implied}%</strong>. Log sales or review{' '}
                <Link
                  href="/admin/settings#waste-pulls"
                  className="font-bold text-emerald-400/90 underline-offset-2 hover:underline"
                >
                  waste goal
                </Link>
                .
              </>
            ) : sales <= 0 ? (
              'Log POS sales in the ledger to compute waste %.'
            ) : (
              'No waste numerator yet, or sales too thin for a ratio.'
            )}
          </p>

          {bucketCount > 0 ? (
            <p className="text-[11px] text-slate-500">
              {bucketCount.toFixed(1)} scrap buckets in ledger ·{' '}
              <button
                type="button"
                onClick={() => setScrapModalOpen(true)}
                className="font-bold text-emerald-400/90 underline-offset-2 hover:underline"
              >
                Adjust bucket $ defaults
              </button>
              {' · '}
              <Link
                href="/admin/settings#kitchen-scrap"
                className="font-bold text-slate-400 underline-offset-2 hover:text-slate-300 hover:underline"
              >
                Full settings
              </Link>
            </p>
          ) : null}
        </div>
      </div>

      <ScrapBucketSettingsModal
        open={scrapModalOpen}
        onClose={() => setScrapModalOpen(false)}
        bucketCount={bucketCount}
      />
    </article>
  );
}
