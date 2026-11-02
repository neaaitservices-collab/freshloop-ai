'use client';

import React from 'react';
import { RotateCcw, Search } from 'lucide-react';
import {
  EMPTY_INVENTORY_FILTERS,
  type InventoryFilters,
  type InventoryGroupBy,
} from '@/lib/domains/inventory/inventoryCatalog';

const SELECT =
  'mt-1 w-full rounded-xl border border-slate-700/90 bg-slate-950 px-2.5 py-2 text-xs font-medium text-slate-100 outline-none focus:border-emerald-500/60';

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
  const patch = (partial: Partial<InventoryFilters>) => onChange({ ...filters, ...partial });

  return (
    <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 p-4 shadow-lg shadow-black/10 backdrop-blur-md">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <label className="relative block min-w-0 flex-1 lg:max-w-md">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Search</span>
          <Search className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-slate-500" />
          <input
            value={filters.query}
            onChange={(e) => patch({ query: e.target.value })}
            placeholder="Item, supplier, origin…"
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-emerald-400/70"
          />
        </label>
        <p className="text-xs text-slate-400 lg:pb-2">
          <span className="font-mono font-bold text-slate-200">{resultCount}</span> items
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
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
        <label className="block">
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
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => {
            onChange(EMPTY_INVENTORY_FILTERS);
            onReset();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
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
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
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
