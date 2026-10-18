'use client';

import React from 'react';
import { DollarSign, ShieldAlert, Sparkles, TrendingUp, RefreshCcw } from 'lucide-react';
import { InventoryItem, RecipeFusionResult } from '@/lib/types';

interface StatsOverviewProps {
  items: InventoryItem[];
  recipes: RecipeFusionResult[];
  currentPullDays: number;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({
  items,
  recipes,
  currentPullDays
}) => {
  const totalItemsCount = items.length;
  const flaggedItems = items.filter(i => i.daysRemaining <= currentPullDays || i.status === 'PULL_RESCUE');
  const markdownItems = items.filter(i => i.status === 'MARKDOWN');
  
  const totalValueAtRisk = flaggedItems.reduce((acc, i) => acc + (i.quantity * i.receivedCost), 0);
  const potentialRecipeRevenue = recipes.reduce((acc, r) => acc + (r.targetRetailPrice * 20), 0);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
      {/* Metric 1 */}
      <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 border border-zinc-800/80 rounded-2xl p-3.5 sm:p-5 shadow-lg group hover:border-emerald-500/40 transition-all flex flex-col justify-between">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] sm:text-xs font-semibold text-zinc-400 truncate">Value At Risk</span>
          <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
            <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        </div>
        <div className="mt-2 sm:mt-3">
          <span className="text-lg sm:text-2xl font-extrabold text-white tracking-tight block">
            ${totalValueAtRisk.toFixed(2)}
          </span>
          <div className="flex items-center gap-1 mt-1 text-[10px] sm:text-xs text-amber-400 font-medium truncate">
            <ShieldAlert className="w-3 h-3 shrink-0" />
            <span className="truncate">{flaggedItems.length} items (≤{currentPullDays}d)</span>
          </div>
        </div>
        <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
      </div>

      {/* Metric 2 */}
      <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 border border-zinc-800/80 rounded-2xl p-3.5 sm:p-5 shadow-lg group hover:border-teal-500/40 transition-all flex flex-col justify-between">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] sm:text-xs font-semibold text-zinc-400 truncate">Rescued Margin</span>
          <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0">
            <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        </div>
        <div className="mt-2 sm:mt-3">
          <span className="text-lg sm:text-2xl font-extrabold text-emerald-400 tracking-tight block">
            72.4% <span className="text-[9px] sm:text-xs font-normal text-emerald-300/70 hidden sm:inline">Avg</span>
          </span>
          <div className="flex items-center gap-1 mt-1 text-[10px] sm:text-xs text-emerald-400 font-medium truncate">
            <Sparkles className="w-3 h-3 shrink-0" />
            <span className="truncate">${potentialRecipeRevenue.toFixed(0)} projected</span>
          </div>
        </div>
        <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
      </div>

      {/* Metric 3 */}
      <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 border border-zinc-800/80 rounded-2xl p-3.5 sm:p-5 shadow-lg group hover:border-cyan-500/40 transition-all flex flex-col justify-between">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] sm:text-xs font-semibold text-zinc-400 truncate">Pull Triggers</span>
          <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0">
            <RefreshCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        </div>
        <div className="mt-2 sm:mt-3">
          <span className="text-lg sm:text-2xl font-extrabold text-white tracking-tight block">
            {flaggedItems.length} <span className="text-[10px] sm:text-xs font-normal text-zinc-400">/ {totalItemsCount}</span>
          </span>
          <div className="flex items-center gap-1 mt-1 text-[10px] sm:text-xs text-cyan-300 font-medium truncate">
            <span className="truncate">Kitchen & Markdown</span>
          </div>
        </div>
        <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-cyan-500/5 rounded-full blur-xl pointer-events-none" />
      </div>

      {/* Metric 4 */}
      <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 border border-zinc-800/80 rounded-2xl p-3.5 sm:p-5 shadow-lg group hover:border-purple-500/40 transition-all flex flex-col justify-between">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] sm:text-xs font-semibold text-zinc-400 truncate">AI Recipes</span>
          <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 shrink-0">
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
        </div>
        <div className="mt-2 sm:mt-3">
          <span className="text-lg sm:text-2xl font-extrabold text-purple-300 tracking-tight block">
            {recipes.length} <span className="text-[10px] sm:text-xs font-normal text-purple-400/80">Active</span>
          </span>
          <div className="flex items-center gap-1 mt-1 text-[10px] sm:text-xs text-purple-300 font-medium truncate">
            <span className="truncate">Cross-department ready</span>
          </div>
        </div>
        <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-purple-500/5 rounded-full blur-xl pointer-events-none" />
      </div>
    </div>
  );
};
