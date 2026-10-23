'use client';

import React, { useState } from 'react';
import { RecipeFusionResult } from '@/lib/types';
import { DepartmentBadge } from '@/components/ui/DepartmentBadge';
import { Button } from '@/components/ui/Button';
import {
  Sparkles,
  Utensils,
  ChevronDown,
  ChevronUp,
  ChefHat,
  CheckCircle,
  Printer,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface RecipeFusionCardProps {
  recipe: RecipeFusionResult;
  onSendToKitchen?: (recipeId: string) => void;
  onOpenDeliModal?: (recipe: RecipeFusionResult) => void;
  onExecuteBatch?: (recipe: RecipeFusionResult) => void;
}

/**
 * Slate & Ocean Steel card for AI-generated rescue recipes.
 * Primary KPIs: gross margin (emerald), target retail, rescued ingredients.
 */
export function RecipeFusionCard({
  recipe,
  onSendToKitchen,
  onOpenDeliModal,
  onExecuteBatch,
}: RecipeFusionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = () => {
    setSent(true);
    onSendToKitchen?.(recipe.id);
  };

  return (
    <article className="flex flex-col justify-between rounded-2xl border border-slate-800/90 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950 p-4 shadow-lg backdrop-blur-md transition-colors hover:border-blue-800/40 sm:rounded-3xl sm:p-6">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <span className="inline-flex max-w-[55%] items-center gap-1.5 truncate rounded-full border border-blue-900/40 bg-blue-950/30 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-blue-200/90">
            <Sparkles className="h-3.5 w-3.5 shrink-0 fill-blue-400/80 text-blue-400/80" />
            <span className="truncate">{recipe.category}</span>
          </span>
          {recipe.grossMarginPct > 0 ? (
            <div className="text-right">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                Gross margin
              </span>
              <span className="text-lg font-black tabular-nums text-emerald-400">
                {recipe.grossMarginPct.toFixed(1)}%
              </span>
            </div>
          ) : null}
        </div>

        <h3 className="text-base font-extrabold leading-snug text-slate-50 sm:text-lg">
          {recipe.recipeName}
        </h3>

        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Rescued ingredients
          </p>
          <div className="flex flex-wrap gap-1.5">
            {recipe.ingredientsUsed.map((ing, idx) => (
              <span
                key={`${ing.name}-${idx}`}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1 text-[11px] text-slate-300"
              >
                <DepartmentBadge department={ing.department} size="sm" />
                <span className="font-semibold text-slate-200">{ing.name}</span>
                <span className="text-slate-500">({ing.quantity})</span>
              </span>
            ))}
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-2 rounded-xl border border-slate-800/80 bg-slate-950/50 p-3 text-xs">
          <div>
            <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
              Target retail
            </dt>
            <dd className="text-sm font-black text-slate-100">
              ${recipe.targetRetailPrice.toFixed(2)}
            </dd>
          </div>
          <div>
            <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Yield</dt>
            <dd className="truncate text-[11px] font-bold text-slate-300" title={recipe.estimatedYield}>
              {recipe.estimatedYield}
            </dd>
          </div>
          <div>
            <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
              Batch food cost
            </dt>
            <dd className="text-sm font-bold text-slate-400">${recipe.estimatedCost.toFixed(2)}</dd>
          </div>
        </dl>

        {expanded ? (
          <div className="space-y-4 border-t border-slate-800 pt-3">
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                Cost breakdown
              </h4>
              <ul className="space-y-1.5">
                {recipe.ingredientsUsed.map((ing, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between rounded-lg border border-slate-800/80 bg-slate-950/40 px-2.5 py-2 text-xs"
                  >
                    <span className="font-semibold text-slate-200">
                      {ing.name} · {ing.quantity}
                    </span>
                    <span className="text-slate-500">${ing.estimatedCost.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                Prep steps
              </h4>
              <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-slate-300">
                {recipe.instructions.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>

            {recipe.chefTips ? (
              <div className="flex items-start gap-2 rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-3 text-xs text-emerald-300/95">
                <ChefHat className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <p>{recipe.chefTips}</p>
              </div>
            ) : null}

            {recipe.allergens && recipe.allergens.length > 0 ? (
              <p className="text-[11px] font-bold text-rose-400/90">
                Allergens: {recipe.allergens.join(', ')}
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      <footer className="mt-4 flex flex-col gap-3 border-t border-slate-800/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-slate-400 transition-colors hover:text-slate-100"
        >
          {expanded ? 'Hide recipe' : 'View prep steps'}
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {onExecuteBatch ? (
            <Button
              type="button"
              variant="primary"
              className="min-h-11 w-full border-amber-800/40 bg-amber-500/90 text-xs text-slate-950 sm:w-auto"
              onClick={() => onExecuteBatch(recipe)}
            >
              <ChefHat className="h-4 w-4" />
              Execute batch
            </Button>
          ) : null}

          {onOpenDeliModal ? (
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 w-full text-xs sm:w-auto"
              onClick={() => onOpenDeliModal(recipe)}
            >
              <Printer className="h-4 w-4" />
              Print Deli Tag
            </Button>
          ) : null}

          <Button
            type="button"
            variant={sent ? 'secondary' : 'success'}
            className={cn('min-h-11 w-full text-xs sm:w-auto', sent && 'border-emerald-800/50 text-emerald-400')}
            onClick={handleSend}
            disabled={sent}
          >
            {sent ? (
              <>
                <CheckCircle className="h-4 w-4" />
                Queued for prep
              </>
            ) : (
              <>
                <Utensils className="h-4 w-4" />
                Send to Prep Kitchen
              </>
            )}
          </Button>
        </div>
      </footer>
    </article>
  );
}
