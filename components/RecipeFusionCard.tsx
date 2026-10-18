'use client';

import React, { useState } from 'react';
import { RecipeFusionResult } from '@/lib/types';
import { DepartmentBadge } from './DepartmentBadge';
import { Sparkles, Utensils, DollarSign, Clock, ChevronDown, ChevronUp, AlertCircle, ChefHat, CheckCircle } from 'lucide-react';

interface RecipeFusionCardProps {
  recipe: RecipeFusionResult;
  onSendToKitchen?: (recipeId: string) => void;
  onOpenDeliModal?: (recipe: RecipeFusionResult) => void;
}

export const RecipeFusionCard: React.FC<RecipeFusionCardProps> = ({
  recipe,
  onSendToKitchen,
  onOpenDeliModal
}) => {
  const [expanded, setExpanded] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = () => {
    setSent(true);
    if (onSendToKitchen) {
      onSendToKitchen(recipe.id);
    }
  };

  return (
    <div className="bg-gradient-to-br from-zinc-900/90 via-zinc-900/60 to-zinc-950/90 border border-emerald-900/40 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xl hover:border-emerald-500/50 transition-all backdrop-blur-md flex flex-col justify-between">
      <div>
        {/* Header Badge Row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider px-2.5 sm:px-3 py-1 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 truncate max-w-[170px]">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400 shrink-0" />
            <span className="truncate">{recipe.category}</span>
          </span>

          <div className="flex items-center gap-2 shrink-0">
            {recipe.grossMarginPct > 0 && (
              <span className="text-[11px] sm:text-xs font-extrabold px-2.5 sm:px-3 py-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 text-zinc-950 shadow-md">
                {recipe.grossMarginPct.toFixed(1)}% Margin
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="text-base sm:text-lg font-bold text-white leading-snug mb-2.5">
          {recipe.recipeName}
        </h3>

        {/* Ingredients Cross-Match Tags */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3.5">
          <span className="text-[9px] sm:text-[10px] font-bold text-zinc-500 uppercase tracking-wider mr-1">Cross-Matched:</span>
          {recipe.ingredientsUsed.map((ing, idx) => (
            <DepartmentBadge key={idx} department={ing.department} size="sm" />
          ))}
        </div>

        {/* Yield & Cost Metrics Bar */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-zinc-950/80 border border-zinc-800/80 text-xs mb-3.5">
          <div>
            <span className="text-zinc-500 text-[9px] sm:text-[10px] block">Target Retail</span>
            <span className="font-extrabold text-white text-xs sm:text-sm">${recipe.targetRetailPrice.toFixed(2)}</span>
          </div>

          <div>
            <span className="text-zinc-500 text-[9px] sm:text-[10px] block">Batch Yield</span>
            <span className="font-bold text-zinc-300 text-[11px] sm:text-xs leading-tight block truncate" title={recipe.estimatedYield}>
              {recipe.estimatedYield}
            </span>
          </div>

          <div>
            <span className="text-zinc-500 text-[9px] sm:text-[10px] block">Food Cost</span>
            <span className="font-extrabold text-emerald-400 text-xs sm:text-sm">${recipe.estimatedCost.toFixed(2)}</span>
          </div>
        </div>


        {/* Expandable Instructions Section */}
        {expanded && (
          <div className="space-y-4 pt-2 border-t border-zinc-800 animate-fadeIn">
            {/* Ingredients Breakdown */}
            <div>
              <h4 className="font-bold text-xs text-zinc-300 uppercase tracking-wider mb-2">Rescued Ingredients Used</h4>
              <div className="space-y-1.5">
                {recipe.ingredientsUsed.map((ing, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-xl bg-zinc-950/60 border border-zinc-800">
                    <span className="font-semibold text-zinc-200">{ing.name} ({ing.quantity})</span>
                    <span className="text-zinc-400 text-[11px]">${ing.estimatedCost.toFixed(2)} est. cost</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Preparation Steps */}
            <div>
              <h4 className="font-bold text-xs text-zinc-300 uppercase tracking-wider mb-2">Chef Preparation Steps</h4>
              <ol className="space-y-2 text-xs text-zinc-300 list-decimal list-inside leading-relaxed">
                {recipe.instructions.map((step, idx) => (
                  <li key={idx} className="pl-1">
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            {/* Chef Tips & Allergens */}
            {recipe.chefTips && (
              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-300 flex items-start gap-2">
                <ChefHat className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <p><strong>Executive Chef Tip:</strong> {recipe.chefTips}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 mt-2 border-t border-zinc-800/80">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
        >
          <span>{expanded ? 'Hide Recipe Details' : 'View Full Recipe & Prep'}</span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        <div className="flex items-center gap-2">
          {onOpenDeliModal && (
            <button
              onClick={() => onOpenDeliModal(recipe)}
              className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold transition-all"
            >
              Print Deli Tag
            </button>
          )}

          <button
            onClick={handleSend}
            disabled={sent}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md ${
              sent
                ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/40'
                : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-emerald-500/20'
            }`}
          >
            {sent ? (
              <>
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>Sent to Kitchen</span>
              </>
            ) : (
              <>
                <Utensils className="w-4 h-4" />
                <span>Send to Prep Kitchen</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
