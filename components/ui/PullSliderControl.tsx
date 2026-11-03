'use client';

import React from 'react';
import { Sliders, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';

type PullDays = 2 | 3 | 4;

interface PullSliderControlProps {
  currentPullDays: PullDays;
  onPullDaysChange: (days: PullDays) => void;
  affectedCount: number;
}

export const PullSliderControl: React.FC<PullSliderControlProps> = ({
  currentPullDays,
  onPullDaysChange,
  affectedCount
}) => {
  const presets = [
    { days: 2, label: '2-Day Strict Pull', desc: 'Tightest rotation window for ultra-fresh deli & bakery' },
    { days: 3, label: '3-Day Standard Pull', desc: 'Optimal grocery balance for yield rescue & production prep' },
    { days: 4, label: '4-Day Extended Pull', desc: 'Early warning trigger for high-volume produce & bulk' }
  ];

  return (
    <div className="bg-gradient-to-br from-zinc-900/90 via-zinc-900/50 to-zinc-950/90 border border-emerald-900/40 rounded-2xl p-5 shadow-xl backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-zinc-100">Human Pull Trigger Sensitivity</h3>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                Admin only
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Adjust remaining shelf life threshold to automatically route short-dated items to production rescue.
            </p>
          </div>
        </div>

        {/* Affected item counter badge */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-950/50 border border-amber-500/40 text-amber-300 text-xs font-medium self-start sm:self-center">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span><strong className="text-amber-200 font-bold">{affectedCount}</strong> items flagged for pull</span>
        </div>
      </div>

      {/* Interactive Slider */}
      <div className="space-y-4 pt-2">
        <div className="flex justify-between items-center text-xs font-semibold text-zinc-300">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <Clock className="w-3.5 h-3.5 text-emerald-400" /> Pull Threshold Window:
          </span>
          <span className="text-emerald-400 text-sm font-extrabold px-3 py-1 rounded-lg bg-emerald-950/80 border border-emerald-500/30">
            {currentPullDays} Days Remaining
          </span>
        </div>

        <div className="relative flex items-center">
          <input
            type="range"
            min={2}
            max={4}
            step={1}
            value={currentPullDays}
            onChange={(e) => {
              const days = parseInt(e.target.value, 10);
              if (days === 2 || days === 3 || days === 4) onPullDaysChange(days);
            }}
            className="w-full h-2.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
        </div>

        {/* Preset Selector Buttons - 3-column compact on mobile (375px) */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 pt-1">
          {presets.map((preset) => {
            const isSelected = currentPullDays === preset.days;
            return (
              <button
                key={preset.days}
                onClick={() => onPullDaysChange(preset.days as PullDays)}
                className={`flex flex-col text-left p-2 sm:p-3 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-emerald-950/60 border-emerald-500/60 text-white shadow-md shadow-emerald-500/10'
                    : 'bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className={`text-[11px] sm:text-xs font-bold truncate ${isSelected ? 'text-emerald-300' : 'text-zinc-300'}`}>
                    <span className="sm:hidden">{preset.days}d</span>
                    <span className="hidden sm:inline">{preset.label}</span>
                  </span>
                  {isSelected && <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />}
                </div>
                <span className="text-[10px] text-zinc-400 sm:hidden mt-0.5 truncate font-medium">
                  {preset.days === 2 ? 'Strict' : preset.days === 3 ? 'Standard' : 'Extended'}
                </span>
                <span className="hidden sm:block text-[11px] text-zinc-500 mt-1 leading-tight">
                  {preset.desc}
                </span>
              </button>
            );
          })}
        </div>

        {/* Mobile active description */}
        <div className="sm:hidden text-[10px] text-zinc-400 bg-zinc-950/60 p-2 rounded-xl border border-zinc-800/80">
          <span className="font-semibold text-emerald-400">Pull Strategy: </span>
          {presets.find(p => p.days === currentPullDays)?.desc}
        </div>
      </div>
    </div>
  );
};
