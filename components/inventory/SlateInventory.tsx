'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Search, Sparkles } from 'lucide-react';
import { useRole } from '@/components/auth/RoleProvider';
import { SubInventoryWorkspace } from '@/components/inventory/SubInventoryWorkspace';
import { PullSliderControl } from '@/components/PullSliderControl';
import type { StockLevel } from '@/lib/stock';
import type { DepartmentType } from '@/lib/types';
import { formatCurrency } from '@/lib/yieldPricing';

const DEPARTMENTS: DepartmentType[] = ['PRODUCE', 'DAIRY', 'BAKERY', 'PANTRY'];

function departmentForName(name: string): DepartmentType {
  const lower = name.toLowerCase();
  if (/cream|milk|yogurt|cheese|butter|egg/.test(lower)) return 'DAIRY';
  if (/bread|sourdough|boule|loaf|pastry|bun|bakery/.test(lower)) return 'BAKERY';
  if (/oil|olive|spice|grain|rice|pasta|sauce/.test(lower)) return 'PANTRY';
  return 'PRODUCE';
}

export function SlateInventory({ levels: initialLevels }: { levels: StockLevel[] | null }) {
  const loading = initialLevels === null;
  const router = useRouter();
  const [levels, setLevels] = useState<StockLevel[]>(() => initialLevels ?? []);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState<string>('ALL');
  const [pullDays, setPullDays] = useState(3);
  const [toast, setToast] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { activeUser } = useRole();

  useEffect(() => {
    if (!initialLevels) return;
    setLevels(initialLevels);
  }, [initialLevels]);

  useEffect(() => {
    const syncFromServer = () => {
      void fetch('/api/inventory/levels', { cache: 'no-store' })
        .then((response) => response.json())
        .then((json) => {
          if (json.success && Array.isArray(json.levels)) {
            setLevels(json.levels as StockLevel[]);
          }
        })
        .catch(() => undefined);
    };
    window.addEventListener('freshloop-inventory-updated', syncFromServer);
    return () => window.removeEventListener('freshloop-inventory-updated', syncFromServer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const departmentFilter = useCallback(
    (row: StockLevel) => {
      const dept = departmentForName(row.name);
      return department === 'ALL' || dept === department;
    },
    [department]
  );

  const onHand = useMemo(() => levels.filter((row) => row.onHand > 0), [levels]);

  const flaggedForMetrics = onHand.filter(
    (row) => row.daysRemaining <= pullDays || row.low || row.isMarkdown
  );

  const totalValueAtRisk = flaggedForMetrics.reduce(
    (sum, row) => sum + row.onHand * row.unitCost,
    0
  );
  const lowCount = onHand.filter((row) => row.low).length;
  const markdownCount = onHand.filter((row) => row.isMarkdown).length;
  const kitchenRoutedCount = levels.filter((row) => row.kitchenPrepQty > 0).length;

  const patchLevel = (level: StockLevel) => {
    setLevels((current) =>
      current.map((item) => (item.productId === level.productId ? level : item))
    );
  };

  const handleTransferSuccess = (message: string, level: StockLevel) => {
    patchLevel(level);
    setErrorMessage(null);
    setToast(message);
    router.refresh();
  };

  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-500/90">
            Unified operations
          </p>
          <h1 className="text-xl font-black tracking-tight text-slate-100 sm:text-2xl">
            Inventory &amp; floor management
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-slate-400 sm:text-sm">
            Two sub-inventories: <strong className="text-emerald-300">retail floor</strong> (shelf)
            and <strong className="text-amber-200">kitchen prep</strong> (rescued / BOM). Clerks work
            the floor tab; kitchen staff use prep or both.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/operations"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-slate-300"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            Ledger
          </Link>
          <button
            type="button"
            onClick={() => router.push('/kitchen')}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-xs font-bold text-zinc-950"
          >
            <Sparkles className="h-4 w-4" />
            Recipes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5 shadow-lg sm:p-5">
          <span className="block truncate text-[10px] font-semibold text-slate-400 sm:text-xs">
            Total value at risk
          </span>
          <span className="mt-1 block text-lg font-extrabold text-amber-400 sm:text-2xl">
            {formatCurrency(totalValueAtRisk)}
          </span>
          <span className="mt-0.5 block text-[10px] text-slate-500">
            {flaggedForMetrics.length} short-dated / low items
          </span>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5 shadow-lg sm:p-5">
          <span className="block truncate text-[10px] font-semibold text-slate-400 sm:text-xs">
            Routed to kitchen
          </span>
          <span className="mt-1 block text-lg font-extrabold text-emerald-400 sm:text-2xl">
            {kitchenRoutedCount} items
          </span>
          <span className="mt-0.5 block text-[10px] text-emerald-400/80">Kitchen prep balance</span>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5 shadow-lg sm:p-5">
          <span className="block truncate text-[10px] font-semibold text-slate-400 sm:text-xs">
            On markdown floor
          </span>
          <span className="mt-1 block text-lg font-extrabold text-rose-400 sm:text-2xl">
            {markdownCount} items
          </span>
          <span className="mt-0.5 block text-[10px] text-rose-400/80">30% discount labels</span>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5 shadow-lg sm:p-5">
          <span className="block truncate text-[10px] font-semibold text-slate-400 sm:text-xs">
            Low stock
          </span>
          <span className="mt-1 block text-lg font-extrabold text-teal-300 sm:text-2xl">
            {lowCount} items
          </span>
          <Link href="/orders" className="mt-0.5 block text-[10px] text-teal-400/80 underline">
            Open buy list
          </Link>
        </div>
      </div>

      <PullSliderControl
        currentPullDays={pullDays}
        onPullDaysChange={setPullDays}
        affectedCount={flaggedForMetrics.length}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-300 focus:border-emerald-500 focus:outline-none"
        >
          <option value="ALL">All departments</option>
          {DEPARTMENTS.map((dept) => (
            <option key={dept} value={dept}>
              {dept.charAt(0) + dept.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <label className="relative block w-full sm:w-48">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search item…"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-slate-200 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
          />
        </label>
      </div>

      <SubInventoryWorkspace
        levels={levels}
        loading={loading}
        pullDays={pullDays}
        staffId={activeUser?.id}
        query={query}
        departmentFilter={departmentFilter}
        retailPriorityOnly
        showRetailCatalog
        onSuccess={handleTransferSuccess}
        onError={(message) => setErrorMessage(message)}
      />

      {errorMessage ? <p className="text-sm font-bold text-[#C4847A]">{errorMessage}</p> : null}
      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-2xl border border-slate-700 bg-slate-900/95 px-4 py-3 text-sm font-bold text-slate-100 shadow-xl backdrop-blur md:bottom-8">
          {toast}
        </div>
      ) : null}
    </section>
  );
}
