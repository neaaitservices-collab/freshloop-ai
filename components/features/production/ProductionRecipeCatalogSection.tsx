'use client';

import React, { forwardRef } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { RecipeFusionCard } from '@/components/features/recipes/RecipeFusionCard';
import { Input } from '@/components/ui/Input';
import type { RecipeFusionResult } from '@/lib/types';
import { cn } from '@/lib/utils/cn';
import {
  RECIPE_CATALOG_FILTER_CATEGORIES,
  type RecipeCatalogCategory,
} from '@/components/features/production/productionDashboardTypes';

export type ProductionRecipeCatalogSectionProps = {
  savedRecipeCount: number;
  recipes: RecipeFusionResult[];
  selectedCategory: RecipeCatalogCategory;
  onCategoryChange: (category: RecipeCatalogCategory) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  canExecuteBom: boolean;
  onOpenDeliModal?: (recipe: RecipeFusionResult) => void;
  onExecuteBatch: (recipe: RecipeFusionResult) => void;
  loadError?: string | null;
  className?: string;
};

export const ProductionRecipeCatalogSection = forwardRef<
  HTMLDetailsElement,
  ProductionRecipeCatalogSectionProps
>(function ProductionRecipeCatalogSection(
  {
    savedRecipeCount,
    recipes,
    selectedCategory,
    onCategoryChange,
    searchQuery,
    onSearchQueryChange,
    canExecuteBom,
    onOpenDeliModal,
    onExecuteBatch,
    loadError = null,
    className,
  },
  ref
) {
  const filtered = recipes.filter((r) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      r.recipeName.toLowerCase().includes(q) || r.category.toLowerCase().includes(q);
    const matchesCat =
      selectedCategory === 'ALL' ||
      r.category.toLowerCase().includes(selectedCategory.toLowerCase());
    return matchesSearch && matchesCat;
  });

  return (
    <details
      ref={ref}
      id="recipe-catalog"
      className={cn(
        'group relative min-w-0 w-full overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/80 shadow-xl scroll-mt-28 lg:scroll-mt-24 lg:rounded-3xl',
        className
      )}
    >
      <summary className="group flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none sm:min-h-12 sm:px-6 sm:py-3.5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 truncate text-sm font-bold text-slate-100 sm:text-base md:text-lg">
          <span className="sm:hidden">Recipe catalog</span>
          <span className="hidden sm:inline">Full recipe catalog</span>
          <span className="font-mono font-black tabular-nums text-emerald-300/90">
            {' '}
            ({savedRecipeCount})
          </span>
        </span>
        <ChevronDown
          className="h-5 w-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="space-y-4 border-t border-slate-800/80 px-4 py-4 sm:px-6 sm:py-5">
        <div className="relative z-40 w-full min-w-0">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Search catalog…"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="min-h-11 w-full pl-10 text-sm"
            aria-label="Search recipe catalog"
          />
        </div>

        <div className="flex min-w-0 flex-wrap gap-1.5">
          {RECIPE_CATALOG_FILTER_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onCategoryChange(cat)}
              className={cn(
                'shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold',
                selectedCategory === cat
                  ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                  : 'bg-slate-800/80 text-slate-400'
              )}
            >
              {cat === 'ALL' ? 'All' : cat}
            </button>
          ))}
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-4">
          {loadError && recipes.length === 0 ? (
            <p role="alert" className="text-sm font-semibold text-rose-200">
              {loadError}
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-500">
              {recipes.length === 0 ? 'No saved recipes.' : 'No recipes match your search.'}
            </p>
          ) : null}
          {filtered.map((recipe) => (
            <RecipeFusionCard
              key={recipe.id}
              recipe={recipe}
              onOpenDeliModal={onOpenDeliModal}
              onExecuteBatch={canExecuteBom ? onExecuteBatch : undefined}
            />
          ))}
        </div>
      </div>
    </details>
  );
});
