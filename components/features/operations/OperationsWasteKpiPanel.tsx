'use client';

import React from 'react';
import type { WasteKpiReport } from '@/lib/domains/inventory/ledger';
import { AlertOctagon, ShieldCheck } from 'lucide-react';

export function OperationsWasteKpiPanel({
  wasteKpi,
  wastePctDisplay,
  isWasteExceedingTarget,
}: {
  wasteKpi: WasteKpiReport | null;
  wastePctDisplay: string;
  isWasteExceedingTarget: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-4 py-2">
        <div>
          <div className="flex items-baseline gap-2.5">
            <span
              className={`text-4xl sm:text-5xl font-black tracking-tight tabular-nums ${
                isWasteExceedingTarget
                  ? 'text-rose-400 drop-shadow-[0_0_15px_rgba(244,63,94,0.6)] animate-pulse'
                  : 'text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.45)]'
              }`}
            >
              {wastePctDisplay}
            </span>
            <span className="text-xs font-bold text-slate-400">
              / Target{' '}
              <strong className="text-white">{(wasteKpi?.targetWastePct ?? 2.5).toFixed(1)}%</strong>
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {wasteKpi?.wastePct === null || wasteKpi?.wastePct === undefined ? (
              <span className="text-slate-400 font-medium">
                Gross sales too low to compute waste % from the live ledger.
              </span>
            ) : isWasteExceedingTarget ? (
              <span className="text-rose-300 font-semibold flex items-center gap-1.5">
                <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0 animate-bounce" />
                Waste exceeds target by +{(wasteKpi.wastePct - wasteKpi.targetWastePct).toFixed(2)}%.
                Prioritize kitchen rescue.
              </span>
            ) : (
              <span className="text-emerald-300/90 font-medium flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                Waste controlled ({(wasteKpi.targetWastePct - wasteKpi.wastePct).toFixed(2)}% under target).
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="h-3 w-full rounded-full bg-slate-950 border border-slate-800 overflow-hidden p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isWasteExceedingTarget
                ? 'bg-gradient-to-r from-amber-500 via-rose-500 to-red-600 animate-pulse'
                : 'bg-gradient-to-r from-emerald-500 to-teal-400'
            }`}
            style={{
              width:
                wasteKpi?.wastePct != null
                  ? `${Math.min(100, (wasteKpi.wastePct / (wasteKpi.targetWastePct * 1.6)) * 100)}%`
                  : '0%',
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-slate-400">
          <span>0.0%</span>
          <span className="text-amber-400 font-bold">
            Target: {wasteKpi?.targetWastePct ?? 2.5}%
          </span>
          <span>4.0%+</span>
        </div>
      </div>
    </div>
  );
}
