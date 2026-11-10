'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChefHat, Printer, Search, UtensilsCrossed } from 'lucide-react';
import type { RecipeFusionResult } from '@/lib/types';
import type { KitchenRecipeDefinition } from '@/lib/domains/manufacturing/types';
import { manufacturingCatalogIsReadOnly } from '@/lib/domains/manufacturing/fallbackRecipes';
import { Button } from '@/components/ui/Button';
import { ScrollTable } from '@/components/ui/layout';
import { subscribeInventoryUpdated } from '@/lib/domains/inventory/inventoryMoveClient';
import { cn } from '@/lib/utils/cn';

export type BomRowStatus = 'ready' | 'below_par' | 'low_stock';

import type { ProductionBomSummary } from '@/components/features/production/ProductionBomKpiBadges';

interface ProductionActiveBomPanelProps {
  recipes: RecipeFusionResult[];
  onExecuteProduction: () => void;
  onPrintDeliLabel?: (recipe: RecipeFusionResult) => void;
  onEditRecipe: (recipe: RecipeFusionResult) => void;
  onBulkPrintDeliLabels?: (recipes: RecipeFusionResult[]) => void;
  onBrowseAll?: () => void;
  hideExecutiveSummary?: boolean;
  onSummaryChange?: (summary: ProductionBomSummary) => void;
  dense?: boolean;
  /** Managers/admins — row opens BOM editor. Kitchen staff see read-only rows. */
  canEditRecipes?: boolean;
  canExecuteBatch?: boolean;
  /** Hydrated from `/api/production/bootstrap` to skip mount `GET /api/manufacturing`. */
  initialManufacturingCatalog?: KitchenRecipeDefinition[] | null;
  /** Wide main column vs omitted (legacy `dense` still tightens table padding). */
  layout?: 'wide' | 'compact';
  onCreateBom?: () => void;
  loadError?: string | null;
  summaryLoading?: boolean;
  onManufacturingReadOnlyChange?: (readOnly: boolean) => void;
}

function categoryTone(category: string): string {
  const c = category.toLowerCase();
  if (c.includes('soup')) return 'border-sky-500/40 bg-sky-950/60 text-sky-300';
  if (c.includes('panzanella') || c.includes('salad'))
    return 'border-emerald-500/40 bg-emerald-950/60 text-emerald-300';
  if (c.includes('parfait') || c.includes('dessert'))
    return 'border-violet-500/40 bg-violet-950/60 text-violet-300';
  if (c.includes('bakery') || c.includes('bread'))
    return 'border-amber-500/40 bg-amber-950/60 text-amber-200';
  return 'border-teal-500/40 bg-teal-950/60 text-teal-300';
}

function parsePortionCount(estimatedYield: string): number {
  const match = estimatedYield.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function readinessForRecipe(
  recipe: RecipeFusionResult,
  catalogById: Map<string, KitchenRecipeDefinition>
): BomRowStatus {
  const live = catalogById.get(recipe.id);
  if (live?.bom?.length) {
    let anyShort = false;
    let anyStock = false;
    for (const line of live.bom) {
      const need = line.standardQtyPerBatch;
      const have = line.availableKitchenStock;
      if (have > 0) anyStock = true;
      if (have < need) anyShort = true;
    }
    if (!anyShort && live.bom.length > 0) return 'ready';
    if (anyStock && anyShort) return 'below_par';
    return 'low_stock';
  }
  if (recipe.ingredientsUsed.length === 0) return 'low_stock';
  if (recipe.estimatedCost <= 0) return 'below_par';
  return 'ready';
}

function statusLabel(status: BomRowStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'below_par':
      return 'Below par';
    case 'low_stock':
      return 'Low stock';
  }
}

const STATUS_SORT_RANK: Record<BomRowStatus, number> = {
  below_par: 0,
  low_stock: 1,
  ready: 2,
};

type BomSortKey = 'name' | 'status' | 'margin' | 'yield' | 'retail';
type SortDir = 'asc' | 'desc';

function StatusBadge({ status }: { status: BomRowStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide',
        status === 'ready' &&
          'border-emerald-500/40 bg-emerald-950/80 text-emerald-300',
        status === 'below_par' &&
          'border-rose-500/45 bg-rose-950/60 text-rose-300',
        status === 'low_stock' &&
          'border-amber-500/40 bg-amber-950/60 text-amber-200'
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

function BomSortHeader({
  label,
  column,
  align = 'left',
  className,
  activeKey,
  sortDir,
  onToggle,
}: {
  label: string;
  column: BomSortKey;
  align?: 'left' | 'right';
  className?: string;
  activeKey: BomSortKey;
  sortDir: SortDir;
  onToggle: (key: BomSortKey) => void;
}) {
  return (
    <th className={cn('px-4 py-3', align === 'right' && 'text-right', className)}>
      <button
        type="button"
        onClick={() => onToggle(column)}
        className={cn(
          'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-300',
          align === 'right' && 'ml-auto'
        )}
      >
        {label}
        {activeKey === column ? (
          sortDir === 'asc' ? (
            <ArrowUp className="h-3 w-3 text-emerald-400" aria-hidden />
          ) : (
            <ArrowDown className="h-3 w-3 text-emerald-400" aria-hidden />
          )
        ) : null}
      </button>
    </th>
  );
}

export function ProductionActiveBomPanel({
  recipes,
  onExecuteProduction,
  onPrintDeliLabel,
  onEditRecipe,
  onBulkPrintDeliLabels,
  onBrowseAll,
  hideExecutiveSummary = false,
  onSummaryChange,
  dense = false,
  layout = 'wide',
  canEditRecipes = true,
  canExecuteBatch = true,
  initialManufacturingCatalog = null,
  onCreateBom,
  loadError = null,
  summaryLoading = false,
  onManufacturingReadOnlyChange,
}: ProductionActiveBomPanelProps) {
  const isCompactLayout = layout === 'compact' || dense;
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<BomSortKey>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [catalogReadOnly, setCatalogReadOnly] = useState(() =>
    manufacturingCatalogIsReadOnly(initialManufacturingCatalog)
  );
  const [catalogById, setCatalogById] = useState<Map<string, KitchenRecipeDefinition>>(() => {
    const map = new Map<string, KitchenRecipeDefinition>();
    if (Array.isArray(initialManufacturingCatalog) && !manufacturingCatalogIsReadOnly(initialManufacturingCatalog)) {
      for (const r of initialManufacturingCatalog) {
        map.set(r.recipeId, r);
      }
    }
    return map;
  });

  useEffect(() => {
    if (!Array.isArray(initialManufacturingCatalog)) return;
    const readOnly = manufacturingCatalogIsReadOnly(initialManufacturingCatalog);
    setCatalogReadOnly(readOnly);
    onManufacturingReadOnlyChange?.(readOnly);
    if (readOnly) {
      setCatalogById(new Map());
      return;
    }
    const map = new Map<string, KitchenRecipeDefinition>();
    for (const r of initialManufacturingCatalog) {
      map.set(r.recipeId, r);
    }
    setCatalogById(map);
  }, [initialManufacturingCatalog, onManufacturingReadOnlyChange]);

  const loadManufacturingCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/manufacturing', { cache: 'no-store' });
      const json = await res.json();
      const recipes = Array.isArray(json.recipes) ? (json.recipes as KitchenRecipeDefinition[]) : [];
      const readOnly =
        json.fallback === true ||
        json.readOnly === true ||
        manufacturingCatalogIsReadOnly(recipes);
      setCatalogReadOnly(readOnly);
      onManufacturingReadOnlyChange?.(readOnly);
      if (!json.success || readOnly) {
        setCatalogById(new Map());
        return;
      }
      const map = new Map<string, KitchenRecipeDefinition>();
      for (const r of recipes) {
        map.set(r.recipeId, r);
      }
      setCatalogById(map);
    } catch {
      setCatalogReadOnly(true);
      onManufacturingReadOnlyChange?.(true);
      setCatalogById(new Map());
    }
  }, [onManufacturingReadOnlyChange]);

  useEffect(() => {
    if (initialManufacturingCatalog === null) {
      void loadManufacturingCatalog();
    }
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void loadManufacturingCatalog(), 450);
    };
    const unsub = subscribeInventoryUpdated((detail) => {
      if (detail?.source === 'level-patch') return;
      scheduleReload();
    });
    return () => {
      unsub();
      if (debounce) clearTimeout(debounce);
    };
  }, [initialManufacturingCatalog, loadManufacturingCatalog]);

  const toggleSort = useCallback(
    (key: BomSortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir(key === 'name' ? 'asc' : 'desc');
      }
    },
    [sortKey]
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const mapped = recipes
      .filter((r) => {
        if (!needle) return true;
        return (
          r.recipeName.toLowerCase().includes(needle) ||
          r.category.toLowerCase().includes(needle)
        );
      })
      .map((recipe) => {
        const portions = parsePortionCount(recipe.estimatedYield);
        const status = readinessForRecipe(recipe, catalogById);
        const retailTotal = portions * recipe.targetRetailPrice;
        return { recipe, portions, status, retailTotal };
      });

    const dir = sortDir === 'asc' ? 1 : -1;
    mapped.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return (
            dir *
            a.recipe.recipeName.localeCompare(b.recipe.recipeName, undefined, {
              sensitivity: 'base',
            })
          );
        case 'status':
          return dir * (STATUS_SORT_RANK[a.status] - STATUS_SORT_RANK[b.status]);
        case 'margin':
          return dir * (a.recipe.grossMarginPct - b.recipe.grossMarginPct);
        case 'yield':
          return dir * (a.portions - b.portions);
        case 'retail':
          return dir * (a.retailTotal - b.retailTotal);
        default:
          return 0;
      }
    });
    return mapped;
  }, [recipes, search, catalogById, sortKey, sortDir]);

  const summary = useMemo(() => {
    const totalRecipes = rows.length;
    const belowPar = rows.filter(
      (r) => r.status === 'below_par' || r.status === 'low_stock'
    ).length;
    const totalYield = rows.reduce((sum, r) => sum + r.portions, 0);
    const avgMargin =
      totalRecipes > 0
        ? rows.reduce((sum, r) => sum + r.recipe.grossMarginPct, 0) / totalRecipes
        : 0;
    return { totalRecipes, belowPar, totalYield, avgMargin };
  }, [rows]);

  useEffect(() => {
    onSummaryChange?.(summary);
  }, [summary, onSummaryChange]);

  const allVisibleSelected =
    rows.length > 0 && rows.every((r) => selectedIds.has(r.recipe.id));
  const someSelected = selectedIds.size > 0;

  const toggleAll = useCallback(() => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(rows.map((r) => r.recipe.id)));
  }, [allVisibleSelected, rows]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedRecipes = useMemo(
    () => recipes.filter((r) => selectedIds.has(r.id)),
    [recipes, selectedIds]
  );

  const labelPrintEnabled = Boolean(onPrintDeliLabel || onBulkPrintDeliLabels);

  const handleBulkPrint = () => {
    if (selectedRecipes.length === 0) return;
    if (onBulkPrintDeliLabels) {
      onBulkPrintDeliLabels(selectedRecipes);
    } else if (onPrintDeliLabel) {
      for (const r of selectedRecipes) onPrintDeliLabel(r);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/80 shadow-xl lg:rounded-3xl">
      {/* Header */}
      <div className="border-b border-slate-800/90 px-3 py-3 sm:px-5 sm:py-4">
        <div
          className={cn(
            'flex flex-col gap-3',
            !isCompactLayout && 'xl:flex-row xl:items-end xl:justify-between'
          )}
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="hidden shrink-0 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-400 sm:flex">
              <UtensilsCrossed className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black leading-snug text-white sm:text-lg">
                {isCompactLayout ? (
                  'Recipes &amp; BOM labels'
                ) : (
                  <>
                    <span className="sm:hidden">Active BOM &amp; labels</span>
                    <span className="hidden sm:inline">
                      Active BOM in Production &amp; Grab-n-Go Labels
                    </span>
                  </>
                )}
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Print deli tags and check ingredient readiness before batching.
              </p>
            </div>
          </div>

          <div
            className={cn(
              'flex w-full min-w-0 flex-col gap-2',
              !isCompactLayout && 'xl:max-w-xl xl:flex-1 xl:flex-row xl:items-center xl:justify-end'
            )}
          >
            <div className="relative z-40 min-w-0 w-full flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-500"
                aria-hidden
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search recipes…"
                aria-label="Search recipes"
                className="w-full min-h-11 rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-xs font-medium text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none"
              />
            </div>

            {labelPrintEnabled && someSelected ? (
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 w-full shrink-0 border-emerald-500/40 bg-emerald-500/15 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25 sm:w-auto"
                onClick={handleBulkPrint}
              >
                <Printer className="h-3.5 w-3.5" />
                Bulk print ({selectedIds.size})
              </Button>
            ) : null}

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              {canExecuteBatch && !catalogReadOnly ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 text-xs font-bold"
                  onClick={onExecuteProduction}
                >
                  <ChefHat className="h-3.5 w-3.5" />
                  Execute batch
                </Button>
              ) : null}
              {onBrowseAll ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 text-xs font-bold"
                  onClick={onBrowseAll}
                >
                  Full catalog
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {catalogReadOnly ? (
        <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold text-slate-100">Recipes unavailable, retry</p>
          <Button type="button" variant="secondary" className="min-h-11 text-xs font-bold" onClick={() => void loadManufacturingCatalog()}>
            Retry
          </Button>
        </div>
      ) : null}

      {!hideExecutiveSummary ? (
        <div className="grid grid-cols-2 gap-px border-b border-slate-800/90 bg-slate-800/90 lg:grid-cols-4">
          {[
            { label: 'Total recipes', value: String(summary.totalRecipes), tone: 'text-white' },
            {
              label: 'Below par / needs prep',
              value: String(summary.belowPar),
              tone: summary.belowPar > 0 ? 'text-rose-400' : 'text-slate-300',
            },
            {
              label: 'Total projected yield',
              value: `${summary.totalYield} portions`,
              tone: 'text-emerald-300',
            },
            {
              label: 'Avg. margin',
              value: `${summary.avgMargin.toFixed(1)}%`,
              tone: 'text-emerald-400',
            },
          ].map((item) => (
            <div key={item.label} className="min-w-0 bg-slate-950/90 px-4 py-3 sm:px-5 sm:py-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-300">
                {item.label}
              </p>
              {summaryLoading ? (
                <div className="mt-2 h-6 w-16 animate-pulse rounded bg-slate-800" />
              ) : (
                <p className={cn('mt-1 font-mono text-lg font-black tabular-nums', item.tone)}>
                  {item.value}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* Table */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center sm:px-8">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3 text-emerald-400">
            <ChefHat className="h-8 w-8" aria-hidden />
          </div>
          {loadError && recipes.length === 0 ? (
            <p role="alert" className="max-w-sm text-sm font-bold text-rose-200">
              {loadError}
            </p>
          ) : recipes.length === 0 ? (
            <>
              <p className="text-sm font-bold text-slate-200">No BOM recipes yet</p>
              <p className="max-w-sm text-xs leading-relaxed text-slate-500">
                Add ingredients, yield, and grab-and-go pricing with{' '}
                <span className="font-semibold text-emerald-300">New BOM</span> in the header.
              </p>
              {canEditRecipes && onCreateBom ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-1 min-h-11 border-emerald-500/40 text-xs font-bold text-emerald-200"
                  onClick={onCreateBom}
                >
                  <ChefHat className="h-4 w-4" />
                  Create BOM
                </Button>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate-500">No recipes match your search.</p>
          )}
        </div>
      ) : (
        <>
        <ul
          className={cn(
            'divide-y divide-slate-800/80',
            isCompactLayout ? 'block' : 'lg:hidden'
          )}
        >
          {rows.map(({ recipe, portions, status, retailTotal }) => (
            <li
              key={recipe.id}
              className={cn(
                'flex gap-3 px-3 py-3',
                (status === 'below_par' || status === 'low_stock') && 'bg-rose-950/20'
              )}
            >
              <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(recipe.id)}
                  onChange={() => toggleOne(recipe.id)}
                  aria-label={`Select ${recipe.recipeName}`}
                  className="h-5 w-5 rounded border-slate-600 bg-slate-900 text-emerald-500"
                />
              </div>
              <div
                className={cn(
                  'min-w-0 flex-1 text-left',
                  canEditRecipes && 'cursor-pointer'
                )}
                {...(canEditRecipes
                  ? {
                      role: 'button' as const,
                      tabIndex: 0,
                      onClick: () => onEditRecipe(recipe),
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') onEditRecipe(recipe);
                      },
                    }
                  : {})}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'rounded-md border px-1.5 py-0.5 text-xs font-bold uppercase',
                      categoryTone(recipe.category)
                    )}
                  >
                    {recipe.category}
                  </span>
                  <StatusBadge status={status} />
                </div>
                <p className="mt-1 text-sm font-bold leading-snug text-white">{recipe.recipeName}</p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300">
                  <span>
                    <span className="font-mono font-bold text-emerald-400">
                      {recipe.grossMarginPct.toFixed(1)}%
                    </span>{' '}
                    margin
                  </span>
                  <span>
                    {portions > 0 ? `${portions} portions` : recipe.estimatedYield}
                  </span>
                  <span className="font-mono text-slate-300">
                    $
                    {retailTotal > 0
                      ? retailTotal.toFixed(2)
                      : recipe.targetRetailPrice.toFixed(2)}
                  </span>
                </div>
              </div>
              {onPrintDeliLabel ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 w-10 min-h-0 shrink-0 border-emerald-500/35 bg-emerald-500/10 p-0 text-emerald-300"
                  aria-label={`Print label for ${recipe.recipeName}`}
                  onClick={() => onPrintDeliLabel(recipe)}
                >
                  <Printer className="h-4 w-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <ScrollTable className={cn(isCompactLayout ? 'hidden' : 'hidden lg:block')}>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="w-12 px-4 py-4 sm:px-6">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    aria-label="Select all recipes"
                    className="h-5 w-5 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500/40"
                  />
                </th>
                <BomSortHeader
                  label="Recipe"
                  column="name"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
                <BomSortHeader
                  label="Status"
                  column="status"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
                <BomSortHeader
                  label="Margin"
                  column="margin"
                  align="right"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
                <BomSortHeader
                  label="Yield"
                  column="yield"
                  align="right"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
                <BomSortHeader
                  label="Retail value"
                  column="retail"
                  align="right"
                  className="hidden md:table-cell"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
                {onPrintDeliLabel ? (
                  <th className="px-4 py-4 text-right sm:px-6">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {rows.map(({ recipe, portions, status, retailTotal }) => (
                <tr
                  key={recipe.id}
                  className={cn(
                    canEditRecipes && 'cursor-pointer',
                    'transition-colors hover:bg-slate-800/40',
                    (status === 'below_par' || status === 'low_stock') &&
                      'bg-rose-950/15 hover:bg-rose-950/25'
                  )}
                  onClick={canEditRecipes ? () => onEditRecipe(recipe) : undefined}
                >
                  <td
                    className={cn('px-3', dense ? 'py-2' : 'px-4 py-4 sm:px-6')}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(recipe.id)}
                      onChange={() => toggleOne(recipe.id)}
                      aria-label={`Select ${recipe.recipeName}`}
                      className="h-5 w-5 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500/40"
                    />
                  </td>
                  <td
                    className={cn(
                      'max-w-[240px] sm:max-w-md',
                      dense ? 'px-3 py-2' : 'px-4 py-4 sm:px-6'
                    )}
                  >
                    <div className="flex flex-col gap-1">
                      <span
                        className={cn(
                          'w-fit rounded-md border px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide',
                          categoryTone(recipe.category)
                        )}
                      >
                        {recipe.category}
                      </span>
                      <span className="text-sm font-bold leading-snug text-white">
                        {recipe.recipeName}
                      </span>
                    </div>
                  </td>
                  <td className={cn('px-3', dense ? 'py-2' : 'py-4')}>
                    <StatusBadge status={status} />
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="font-mono text-sm font-bold tabular-nums text-emerald-400">
                      {recipe.grossMarginPct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="text-sm font-semibold text-slate-200">
                      {portions > 0 ? `${portions} portions` : recipe.estimatedYield}
                    </span>
                  </td>
                  <td className="hidden px-4 py-4 text-right md:table-cell">
                    <span className="font-mono text-sm font-semibold tabular-nums text-slate-200">
                      ${retailTotal > 0 ? retailTotal.toFixed(2) : recipe.targetRetailPrice.toFixed(2)}
                    </span>
                    {retailTotal > 0 ? (
                      <span className="mt-0.5 block text-[10px] text-slate-500">
                        @ ${recipe.targetRetailPrice.toFixed(2)} ea
                      </span>
                    ) : null}
                  </td>
                  {onPrintDeliLabel ? (
                    <td
                      className="px-4 py-4 text-right sm:px-6"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        type="button"
                        variant="secondary"
                        className="inline-flex h-9 min-h-0 shrink-0 gap-1.5 border-emerald-500/35 bg-emerald-500/10 px-3 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20"
                        onClick={() => onPrintDeliLabel(recipe)}
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Print label
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
        </>
      )}
    </section>
  );
}
