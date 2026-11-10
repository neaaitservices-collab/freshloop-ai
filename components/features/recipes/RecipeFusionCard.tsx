'use client';

import React, { useState } from 'react';
import { RecipeFusionResult } from '@/lib/types';
import { DepartmentBadge } from '@/components/ui/DepartmentBadge';
import { Button } from '@/components/ui/Button';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  ChefHat,
  Printer,
} from 'lucide-react';

export interface RecipeFusionCardProps {
  recipe: RecipeFusionResult;
  onOpenDeliModal?: (recipe: RecipeFusionResult) => void;
  onExecuteBatch?: (recipe: RecipeFusionResult) => void;
}

/**
 * Slate & Ocean Steel card for AI-generated rescue recipes.
 * Primary KPIs: gross margin (emerald), target retail, rescued ingredients.
 */
export function RecipeFusionCard({
  recipe,
  onOpenDeliModal,
  onExecuteBatch,
}: RecipeFusionCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="flex h-full w-full min-w-0 flex-col justify-between rounded-2xl border border-slate-800/90 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950 p-4 shadow-lg backdrop-blur-md transition-colors hover:border-blue-800/40 sm:rounded-3xl sm:p-5 md:p-6">
      <header className="min-w-0 space-y-3 md:space-y-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <span className="inline-flex min-w-0 max-w-full flex-1 items-center gap-1.5 rounded-full border border-blue-900/40 bg-blue-950/30 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-blue-200/90 sm:text-xs">
            <Sparkles className="h-3.5 w-3.5 shrink-0 fill-blue-400/80 text-blue-400/80" />
            <span className="truncate">{recipe.category}</span>
          </span>
          {recipe.grossMarginPct > 0 ? (
            <div className="shrink-0 text-right">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                Gross margin
              </span>
              <span className="font-mono text-lg font-black tabular-nums text-emerald-400 sm:text-xl">
                {recipe.grossMarginPct.toFixed(1)}%
              </span>
            </div>
          ) : null}
        </div>

        <h3 className="text-base font-extrabold leading-snug text-slate-50 sm:text-lg md:text-xl">
          {recipe.recipeName}
        </h3>

        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
            Rescued ingredients
          </p>
          <div className="flex flex-wrap gap-2">
            {recipe.ingredientsUsed.map((ing, idx) => (
              <span
                key={`${ing.name}-${idx}`}
                className="inline-flex max-w-full items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/50 px-2.5 py-1.5 text-xs text-slate-300 sm:text-xs"
              >
                <DepartmentBadge department={ing.department} size="sm" />
                <span className="font-semibold text-slate-200">{ing.name}</span>
                <span className="text-slate-500">({ing.quantity})</span>
              </span>
            ))}
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800/80 bg-slate-950/50 p-3 text-xs sm:grid-cols-3 sm:gap-4 sm:p-4">
          <div className="min-w-0 sm:border-r sm:border-slate-800/80 sm:pr-3">
            <dt className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Target retail
            </dt>
            <dd className="font-mono text-base font-black tabular-nums text-slate-100 sm:text-lg">
              ${recipe.targetRetailPrice.toFixed(2)}
            </dd>
          </div>
          <div className="min-w-0 sm:border-r sm:border-slate-800/80 sm:px-3">
            <dt className="text-xs font-bold uppercase tracking-wider text-slate-300">Yield</dt>
            <dd
              className="truncate text-sm font-bold text-slate-300"
              title={recipe.estimatedYield}
            >
              {recipe.estimatedYield}
            </dd>
          </div>
          <div className="min-w-0 sm:pl-1">
            <dt className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Batch food cost
            </dt>
            <dd className="font-mono text-base font-bold tabular-nums text-slate-400 sm:text-lg">
              ${recipe.estimatedCost.toFixed(2)}
            </dd>
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
              <p className="text-xs font-bold text-rose-400/90">
                Allergens: {recipe.allergens.join(', ')}
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      <footer className="mt-4 flex min-w-0 flex-col gap-3 border-t border-slate-800/80 pt-4 md:mt-5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 text-xs font-semibold text-slate-400 transition-colors hover:text-slate-100 sm:w-auto sm:justify-start sm:border-transparent sm:bg-transparent sm:px-0"
        >
          {expanded ? 'Hide recipe' : 'View prep steps'}
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {onExecuteBatch ? (
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 w-full text-xs"
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
              className="min-h-11 w-full text-xs"
              onClick={() => onOpenDeliModal(recipe)}
            >
              <Printer className="h-4 w-4" />
              Print Deli Tag
            </Button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
