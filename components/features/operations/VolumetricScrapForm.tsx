'use client';

import React, { useState } from 'react';
import { Scale, CheckCircle2, Plus, RotateCcw, Loader2, AlertCircle } from 'lucide-react';
import {
  computeScrapBucketEconomics,
  scrapTotalsForBucketCount,
} from '@/lib/domains/stats/scrapBucketEconomics';

export interface StoreScrapConfig {
  scrapBucketVolumeL: number;
  estimatedWeightPerLiterKg: number;
  blendedCostPerKg: number;
}

export interface VolumetricScrapLoggedEvent {
  bucketsAdded: number;
  totalVolumeLiters: number;
  estimatedWeightKg: number;
  estimatedScrapCostValue: number;
  loggedAt: string;
}

interface VolumetricScrapFormProps {
  storeConfig?: StoreScrapConfig;
  totalBucketsLoggedToday: number;
  onLogScrapBuckets: (
    bucketsDelta: number,
    event: VolumetricScrapLoggedEvent
  ) => void | Promise<void>;
  onResetBuckets?: () => void;
  compact?: boolean;
}

export const VolumetricScrapForm: React.FC<VolumetricScrapFormProps> = ({
  storeConfig = {
    scrapBucketVolumeL: 20.0,
    estimatedWeightPerLiterKg: 0.65,
    blendedCostPerKg: 3.5,
  },
  totalBucketsLoggedToday,
  onLogScrapBuckets,
  onResetBuckets,
  compact = false,
}) => {
  const [customBuckets, setCustomBuckets] = useState<number>(1);
  const [lastLoggedToast, setLastLoggedToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const scrapInputs = {
    volumeL: storeConfig.scrapBucketVolumeL,
    densityKgPerL: storeConfig.estimatedWeightPerLiterKg,
    costPerKg: storeConfig.blendedCostPerKg,
  };
  const bucketEcon = computeScrapBucketEconomics(scrapInputs);
  const weightPerBucketKg = bucketEcon.kgPerBucket;
  const costPerBucket = bucketEcon.dollarsPerBucket;
  const todayTotals = scrapTotalsForBucketCount(totalBucketsLoggedToday, scrapInputs);
  const totalVolumeTodayL = todayTotals.totalVolumeL;
  const totalWeightTodayKg = todayTotals.totalKg;
  const totalScrapCostToday = todayTotals.totalDollars;

  const customPreview = scrapTotalsForBucketCount(customBuckets, scrapInputs);

  const triggerOneClickLog = async (bucketsCount: number) => {
    if (bucketsCount <= 0 || isLoading) return;

    const logged = scrapTotalsForBucketCount(bucketsCount, scrapInputs);
    const event: VolumetricScrapLoggedEvent = {
      bucketsAdded: bucketsCount,
      totalVolumeLiters: logged.totalVolumeL,
      estimatedWeightKg: logged.totalKg,
      estimatedScrapCostValue: logged.totalDollars,
      loggedAt: new Date().toISOString(),
    };

    setIsLoading(true);
    setErrorToast(null);
    try {
      await onLogScrapBuckets(bucketsCount, event);
      setLastLoggedToast(
        `+${bucketsCount} bucket(s) (${event.estimatedWeightKg} kg · $${event.estimatedScrapCostValue.toFixed(2)})`
      );
      setTimeout(() => setLastLoggedToast(null), 3500);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not log volumetric scrap.';
      setErrorToast(message);
      setTimeout(() => setErrorToast(null), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  const volumeLabel = storeConfig.scrapBucketVolumeL;

  return (
    <section
      aria-label="Volumetric scrap log"
      className={
        compact
          ? 'rounded-2xl border border-emerald-500/25 bg-slate-900/90 p-3 shadow-lg'
          : 'rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-slate-900/95 via-slate-900/80 to-slate-950 p-4 shadow-xl shadow-emerald-950/20 backdrop-blur-xl sm:p-5'
      }
    >
      <div
        className={
          compact
            ? 'flex flex-col gap-2'
            : 'flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'
        }
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className="shrink-0 rounded-2xl border border-rose-500/35 bg-rose-500/10 p-2.5 text-rose-400">
            <Scale className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className={
                  compact
                    ? 'text-sm font-black text-emerald-300'
                    : 'text-base font-black text-emerald-300 sm:text-lg'
                }
              >
                Volumetric log ({volumeLabel}L)
              </h2>
              <span
                className="rounded-full border border-slate-600 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-300"
                title="Bucket size, kg/L, and $/kg from Admin → Store settings"
              >
                Store settings
              </span>
            </div>
            {!compact ? (
              <p className="text-xs text-slate-400">
                {volumeLabel}L × {storeConfig.estimatedWeightPerLiterKg} kg/L × $
                {storeConfig.blendedCostPerKg.toFixed(2)}/kg.{' '}
                <code className="text-slate-200">VOL-SCRAP-BUCKET</code>
              </p>
            ) : null}
          </div>
        </div>

        <div
          className={
            compact
              ? 'text-[10px] font-mono text-emerald-100/80'
              : 'shrink-0 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-[11px] font-mono text-emerald-100/90'
          }
        >
          1× = <strong className="text-white">{weightPerBucketKg} kg</strong> ·{' '}
          <strong className="text-rose-300">${costPerBucket.toFixed(2)}</strong>
        </div>
      </div>

      <div
        className={
          compact
            ? 'mt-3 flex flex-col gap-2'
            : 'mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-stretch'
        }
      >
        <div
          className={
            compact ? 'grid grid-cols-3 gap-1.5' : 'grid grid-cols-3 gap-2 lg:col-span-7'
          }
        >
          {[0.5, 1, 2].map((bucketPreset) => {
            const presetKg = (bucketPreset * weightPerBucketKg).toFixed(1);
            const presetCost = (bucketPreset * costPerBucket).toFixed(2);
            const label =
              bucketPreset === 1 ? '+1 bucket' : `+${bucketPreset} buckets`;
            return (
              <button
                key={bucketPreset}
                type="button"
                disabled={isLoading}
                onClick={() => void triggerOneClickLog(bucketPreset)}
                className={
                  compact
                    ? 'rounded-lg border border-emerald-500/20 bg-slate-950/90 px-2 py-1.5 text-left text-[10px] font-bold text-white hover:border-emerald-400/50 disabled:opacity-60'
                    : 'group flex min-h-[4.5rem] flex-col justify-between rounded-2xl border border-emerald-500/20 bg-slate-950/90 p-3 text-left transition-all hover:border-emerald-400/50 hover:bg-emerald-950/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
                }
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={compact ? '' : 'text-xs font-black sm:text-sm'}>{label}</span>
                  {!compact ? <Plus className="h-4 w-4 shrink-0 text-emerald-400" /> : null}
                </div>
                {!compact ? (
                  <div className="mt-1.5 font-mono text-[11px] text-slate-400">
                    <span className="block">{presetKg} kg est.</span>
                    <strong className="text-rose-300">+${presetCost} scrap</strong>
                  </div>
                ) : (
                  <span className="font-mono text-[9px] text-rose-300">+${presetCost}</span>
                )}
              </button>
            );
          })}
        </div>

        <div
          className={
            compact
              ? 'flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/80 p-2'
              : 'flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-950/80 p-3 sm:flex-row sm:items-end lg:col-span-5'
          }
        >
          <div className="min-w-0 flex-1">
            {!compact ? (
              <label
                htmlFor="volumetric-scrap-custom"
                className="block text-[10px] font-bold uppercase tracking-wide text-slate-500"
              >
                Custom quantity ({volumeLabel}L buckets)
              </label>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <input
                id="volumetric-scrap-custom"
                type="number"
                min={0.25}
                step={0.25}
                value={customBuckets}
                disabled={isLoading}
                onChange={(e) =>
                  setCustomBuckets(Math.max(0.25, Number(e.target.value) || 1))
                }
                className="w-20 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs font-bold font-mono text-white"
              />
              <span className="font-mono text-[11px] text-slate-400">
                Preview: {customPreview.totalVolumeL} L · {customPreview.totalKg} kg · $
                {customPreview.totalDollars.toFixed(2)}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={isLoading}
            onClick={() => void triggerOneClickLog(customBuckets)}
            className={
              compact
                ? 'shrink-0 rounded-lg bg-rose-500 px-3 py-2 text-[10px] font-black text-slate-950 disabled:opacity-70'
                : 'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-rose-500 px-5 py-2.5 text-xs font-black text-slate-950 shadow-lg shadow-rose-500/25 transition-all hover:bg-rose-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70'
            }
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                …
              </>
            ) : compact ? (
              'Scrap'
            ) : (
              'Log scrap'
            )}
          </button>
        </div>
      </div>

      <div
        className={
          compact
            ? 'mt-2 flex flex-wrap gap-1.5 border-t border-slate-800/80 pt-2 text-[10px]'
            : 'mt-4 flex flex-col gap-3 border-t border-slate-800/80 pt-3 sm:flex-row sm:items-center sm:justify-between'
        }
      >
        <div className={compact ? 'flex flex-wrap gap-1.5' : 'flex flex-wrap gap-2 text-[11px]'}>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-950/50 px-3 py-1 font-semibold text-emerald-100">
            KPI total (30 days):{' '}
            <span className="font-mono text-white">
              {totalBucketsLoggedToday} buckets ({totalVolumeTodayL}L)
            </span>
          </span>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-950/50 px-3 py-1 font-semibold text-emerald-100">
            Organic weight:{' '}
            <span className="font-mono text-amber-200">{totalWeightTodayKg} kg</span>
          </span>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-950/50 px-3 py-1 font-semibold text-emerald-100">
            Scrap KPI impact:{' '}
            <span className="font-mono text-rose-300">
              ${totalScrapCostToday.toFixed(2)}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {errorToast && (
            <span className="flex items-center gap-1 text-[11px] font-bold text-rose-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {errorToast}
            </span>
          )}
          {lastLoggedToast && (
            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {lastLoggedToast}
            </span>
          )}

          {totalBucketsLoggedToday > 0 && onResetBuckets && (
            <button
              type="button"
              onClick={onResetBuckets}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-400 transition-colors hover:text-white"
            >
              <RotateCcw className="h-3 w-3" />
              Refresh KPI
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
