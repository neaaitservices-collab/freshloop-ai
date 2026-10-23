'use client';

import React, { useState } from 'react';
import {
  Trash2,
  Scale,
  CheckCircle2,
  AlertTriangle,
  Plus,
  RotateCcw,
} from 'lucide-react';

// ============================================================================
// Strict Types for Phase 5 Volumetric Kitchen Scrap 1-Click Logger
// ============================================================================

export interface StoreScrapConfig {
  scrapBucketVolumeL: number; // Default 20.0 L
  estimatedWeightPerLiterKg: number; // Default 0.65 kg/L
  blendedCostPerKg: number; // Default $3.50 / kg
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
  onLogScrapBuckets: (bucketsDelta: number, event: VolumetricScrapLoggedEvent) => void;
  onResetBuckets?: () => void;
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
}) => {
  const [customBuckets, setCustomBuckets] = useState<number>(1);
  const [lastLoggedToast, setLastLoggedToast] = useState<string | null>(null);

  // Formula from Master Plan & StoreSetting:
  // Peso por cubeta (kg) = Scrap_Bucket_Volume_L (20L) * Estimated_Weight_Per_Liter_kg (0.65 kg/L) = 13.0 kg
  // Costo por cubeta ($) = 13.0 kg * blendedCostPerKg ($3.50/kg) = $45.50
  const weightPerBucketKg = Number(
    (
      storeConfig.scrapBucketVolumeL * storeConfig.estimatedWeightPerLiterKg
    ).toFixed(2)
  );
  const costPerBucket = Number(
    (weightPerBucketKg * storeConfig.blendedCostPerKg).toFixed(2)
  );

  const totalVolumeTodayL = Number(
    (totalBucketsLoggedToday * storeConfig.scrapBucketVolumeL).toFixed(1)
  );
  const totalWeightTodayKg = Number(
    (totalBucketsLoggedToday * weightPerBucketKg).toFixed(2)
  );
  const totalScrapCostToday = Number(
    (totalBucketsLoggedToday * costPerBucket).toFixed(2)
  );

  const triggerOneClickLog = (bucketsCount: number) => {
    if (bucketsCount <= 0) return;

    const event: VolumetricScrapLoggedEvent = {
      bucketsAdded: bucketsCount,
      totalVolumeLiters: Number(
        (bucketsCount * storeConfig.scrapBucketVolumeL).toFixed(1)
      ),
      estimatedWeightKg: Number((bucketsCount * weightPerBucketKg).toFixed(2)),
      estimatedScrapCostValue: Number(
        (bucketsCount * costPerBucket).toFixed(2)
      ),
      loggedAt: new Date().toISOString(),
    };

    onLogScrapBuckets(bucketsCount, event);
    setLastLoggedToast(
      `+${bucketsCount} Cubeta(s) 20L registrada(s) (${event.estimatedWeightKg} kg = $${event.estimatedScrapCostValue.toFixed(
        2
      )})`
    );
    setTimeout(() => setLastLoggedToast(null), 3500);
  };

  return (
    <div className="rounded-3xl bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-950 border border-rose-900/40 p-5 sm:p-6 shadow-2xl backdrop-blur-xl space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black text-white">
                Registro Volumétrico en 1 Clic (Cubetas Scrap 20L)
              </h3>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-500/30">
                StoreSetting Sync
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              20L × 0.65 kg/L × $3.50/kg por cubeta. Ledger ref{' '}
              <code className="text-slate-300">VOL-SCRAP-BUCKET</code>.
            </p>
          </div>
        </div>

        {/* Formula Pill */}
        <div className="px-3.5 py-2 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 shrink-0">
          1 Cubeta ({storeConfig.scrapBucketVolumeL}L ×{' '}
          {storeConfig.estimatedWeightPerLiterKg}kg/L) ={' '}
          <strong className="text-amber-300">{weightPerBucketKg} kg</strong> × $
          {storeConfig.blendedCostPerKg.toFixed(2)} ={' '}
          <strong className="text-rose-400">${costPerBucket.toFixed(2)}</strong>
        </div>
      </div>

      {/* 1-Click Preset Buttons + Custom Input */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        {/* Quick 1-Click Buttons */}
        <div className="lg:col-span-7 grid grid-cols-3 gap-2.5">
          {[0.5, 1, 2].map((bucketPreset) => {
            const presetKg = (bucketPreset * weightPerBucketKg).toFixed(1);
            const presetCost = (bucketPreset * costPerBucket).toFixed(2);
            return (
              <button
                key={bucketPreset}
                type="button"
                onClick={() => triggerOneClickLog(bucketPreset)}
                className="group min-h-12 rounded-2xl border border-slate-800 bg-slate-950 p-3.5 text-left flex flex-col justify-between cursor-pointer transition-all hover:border-rose-500/60 hover:bg-rose-950/50 active:scale-95"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-black text-white group-hover:text-rose-300">
                    +{bucketPreset} {bucketPreset === 1 ? 'Cubeta' : 'Cubetas'}
                  </span>
                  <Plus className="w-4 h-4 text-rose-400" />
                </div>
                <div className="mt-2 text-[11px] font-mono text-slate-400">
                  <span className="block">{presetKg} kg est.</span>
                  <strong className="text-rose-400">+${presetCost} merma</strong>
                </div>
              </button>
            );
          })}
        </div>

        {/* Custom X Cubetas Input + Submit */}
        <div className="lg:col-span-5 flex items-center gap-2 bg-slate-950 p-3 rounded-2xl border border-slate-800">
          <div className="flex-1">
            <label className="text-[10px] font-bold uppercase text-slate-500 block">
              Cantidad Personalizada (X Cubetas 20L)
            </label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                min={0.25}
                step={0.25}
                value={customBuckets}
                onChange={(e) =>
                  setCustomBuckets(Math.max(0.25, Number(e.target.value) || 1))
                }
                className="w-20 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono font-bold text-white"
              />
              <span className="text-[11px] font-mono text-slate-400">
                = {(customBuckets * weightPerBucketKg).toFixed(1)} kg ($
                {(customBuckets * costPerBucket).toFixed(2)})
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => triggerOneClickLog(customBuckets)}
            className="min-h-12 shrink-0 rounded-xl bg-rose-500 px-4 py-3 text-xs font-black text-slate-950 shadow-lg shadow-rose-500/20 transition-all hover:bg-rose-400 active:scale-95 cursor-pointer"
          >
            Registrar Scrap
          </button>
        </div>
      </div>

      {/* Live Daily Accumulated Volumetric Scrap Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-slate-400">
            Acumulado Hoy:{' '}
            <strong className="text-white font-mono">
              {totalBucketsLoggedToday} cubetas ({totalVolumeTodayL}L)
            </strong>
          </span>
          <span className="text-slate-400">
            Peso Orgánico:{' '}
            <strong className="text-amber-300 font-mono">
              {totalWeightTodayKg} kg
            </strong>
          </span>
          <span className="text-slate-400">
            Impacto en KPI Merma:{' '}
            <strong className="text-rose-400 font-mono">
              ${totalScrapCostToday.toFixed(2)}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-3">
          {lastLoggedToast && (
            <span className="text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {lastLoggedToast}
            </span>
          )}

          {totalBucketsLoggedToday > 0 && onResetBuckets && (
            <button
              type="button"
              onClick={onResetBuckets}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-[11px] font-semibold cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reiniciar Turno</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
