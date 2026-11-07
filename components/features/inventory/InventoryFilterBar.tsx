'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import {
  EMPTY_INVENTORY_FILTERS,
  type InventoryFilters,
  type InventoryGroupBy,
} from '@/lib/domains/inventory/inventoryCatalog';
import { cn } from '@/lib/utils/cn';

const SELECT =
  'min-h-11 w-full rounded-xl border border-slate-700/90 bg-slate-950 px-2.5 py-2 text-xs font-medium text-slate-100 outline-none focus:border-emerald-500/60';

export function InventoryFilterBar({
  filters,
  onChange,
  groupBy,
  onGroupBy,
  options,
  resultCount,
  onReset,
}: {
  filters: InventoryFilters;
  onChange: (next: InventoryFilters) => void;
  groupBy: InventoryGroupBy;
  onGroupBy: (value: InventoryGroupBy) => void;
  options: {
    departments: string[];
    categories: string[];
    productTypes: string[];
    origins: string[];
    suppliers: string[];
  };
  resultCount: number;
  onReset: () => void;
}) {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const patch = (partial: Partial<InventoryFilters>) => onChange({ ...filters, ...partial });

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.department !== 'ALL') n += 1;
    if (filters.category !== 'ALL') n += 1;
    if (filters.productType !== 'ALL') n += 1;
    if (filters.origin !== 'ALL') n += 1;
    if (filters.supplier !== 'ALL') n += 1;
    if (groupBy !== 'department') n += 1;
    return n;
  }, [filters, groupBy]);

  const resetFilters = () => {
    onChange(EMPTY_INVENTORY_FILTERS);
    onReset();
    setMobileFiltersOpen(false);
  };

  const filterFields = (
    <>
      <FilterSelect
        label="Department"
        value={filters.department}
        options={options.departments}
        onChange={(department) => patch({ department })}
      />
      <FilterSelect
        label="Category"
        value={filters.category}
        options={options.categories}
        onChange={(category) => patch({ category })}
      />
      <FilterSelect
        label="Type"
        value={filters.productType}
        options={options.productTypes}
        onChange={(productType) => patch({ productType })}
      />
      <FilterSelect
        label="Origin"
        value={filters.origin}
        options={options.origins}
        onChange={(origin) => patch({ origin })}
      />
      <FilterSelect
        label="Supplier"
        value={filters.supplier}
        options={options.suppliers}
        onChange={(supplier) => patch({ supplier })}
      />
      <label className="block min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Group by</span>
        <select
          value={groupBy}
          onChange={(e) => onGroupBy(e.target.value as InventoryGroupBy)}
          className={SELECT}
        >
          <option value="none">None</option>
          <option value="department">Department</option>
          <option value="supplier">Supplier</option>
        </select>
      </label>
    </>
  );

  return (
    <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 p-3 shadow-lg shadow-black/10 backdrop-blur-md sm:p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <label className="relative block min-w-0 xl:max-w-xs xl:flex-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Search</span>
          <Search className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-slate-500" />
          <input
            value={filters.query}
            onChange={(e) => patch({ query: e.target.value })}
            placeholder="Item, supplier, origin…"
            className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-emerald-400/70"
          />
        </label>
        <p className="text-xs text-slate-400 xl:pb-2">
          <span className="font-mono font-bold text-slate-200">{resultCount}</span> items
        </p>
      </div>

      <button
        type="button"
        onClick={() => setMobileFiltersOpen((open) => !open)}
        className="mt-3 flex min-h-11 w-full items-center justify-between rounded-xl border border-slate-700/90 bg-slate-950/80 px-3 text-xs font-bold text-slate-200 xl:hidden"
        aria-expanded={mobileFiltersOpen}
      >
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-emerald-400/90" aria-hidden />
          Filters
          {activeFilterCount > 0 ? (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
              {activeFilterCount}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 text-slate-400 transition', mobileFiltersOpen && 'rotate-180')}
          aria-hidden
        />
      </button>

      <div
        className={cn(
          'mt-3 gap-3',
          mobileFiltersOpen ? 'grid sm:grid-cols-2' : 'hidden',
          'xl:mt-4 xl:flex xl:flex-wrap xl:items-end'
        )}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:flex xl:flex-1 xl:flex-wrap xl:gap-3 xl:[&>label]:min-w-[8.5rem] xl:[&>label]:max-w-[10rem] xl:[&>label]:flex-1">
          {filterFields}
        </div>
        <button
          type="button"
          onClick={resetFilters}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 self-end rounded-lg px-3 text-xs font-bold text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 xl:ml-auto"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset filters
        </button>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={SELECT}>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt === 'ALL' ? `All ${label.toLowerCase()}s` : opt}
          </option>
        ))}
      </select>
    </label>
  );
}
