'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowRightLeft,
  ChevronDown,
  Search,
  Sparkles,
  Tag,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useRole } from '@/components/auth/RoleProvider';
import { PullSliderControl } from '@/components/PullSliderControl';
import type { StockLevel } from '@/lib/stock';
import type { DepartmentType } from '@/lib/types';
import { formatCurrency, formatPercent, formatUnits, stockUnitLabel } from '@/lib/yieldPricing';

const DEPARTMENTS: DepartmentType[] = ['PRODUCE', 'DAIRY', 'BAKERY', 'PANTRY'];

function casesLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function storedMargin(row: StockLevel): number | null {
  if (row.retailPrice === null || row.retailPrice <= 0) return null;
  return ((row.retailPrice - row.unitCost) / row.retailPrice) * 100;
}

function shelfCue(days: number): { label: string; className: string; warn: boolean } {
  const label = `${days} ${days === 1 ? 'day' : 'days'} left`;
  if (days < 2) return { label, className: 'text-[#C4847A]', warn: true };
  if (days <= 7) return { label, className: 'text-[#C4A574]', warn: true };
  return { label, className: 'text-slate-400', warn: false };
}

function departmentForName(name: string): DepartmentType {
  const lower = name.toLowerCase();
  if (/cream|milk|yogurt|cheese|butter|egg/.test(lower)) return 'DAIRY';
  if (/bread|sourdough|boule|loaf|pastry|bun|bakery/.test(lower)) return 'BAKERY';
  if (/oil|olive|spice|grain|rice|pasta|sauce/.test(lower)) return 'PANTRY';
  return 'PRODUCE';
}

function StockRow({
  row,
  busy,
  onKitchen,
  onMarkdown,
  onWaste,
}: {
  row: StockLevel;
  busy: boolean;
  onKitchen: () => void;
  onMarkdown: () => void;
  onWaste: () => void;
}) {
  const margin = storedMargin(row);
  const shelf = shelfCue(row.daysRemaining);

  return (
    <li className="flex flex-col gap-3 border-b border-slate-800/80 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-slate-100">{row.name}</span>
        <span className="mt-0.5 block truncate text-[11px] text-slate-500">{row.supplier}</span>
        <span className="mt-1 block font-mono text-[11px] text-slate-300">
          Floor: {formatUnits(row.onHand)} {stockUnitLabel(row.unitType)} / {casesLabel(row.onHandCases)}{' '}
          cases
          {row.kitchenPrepQty > 0 ? (
            <span className="text-emerald-400/90">
              {' '}
              · Kitchen prep: {formatUnits(row.kitchenPrepQty)} {stockUnitLabel(row.unitType)}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[11px] text-slate-400">
          {row.retailPrice !== null ? (
            <>
              Shelf:{' '}
              {row.isMarkdown && row.regularRetailPrice ? (
                <>
                  <span className="text-slate-500 line-through">
                    {formatCurrency(row.regularRetailPrice)}
                  </span>{' '}
                  <span className="font-bold text-amber-200">{formatCurrency(row.retailPrice)}</span>
                </>
              ) : (
                formatCurrency(row.retailPrice)
              )}{' '}
              ·{' '}
            </>
          ) : null}
          Margin: {margin === null ? '—' : `${formatPercent(margin)}%`} | Value:{' '}
          {formatCurrency(row.onHand * row.unitCost)}
        </span>
        <span className={`mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold ${shelf.className}`}>
          {shelf.warn ? <TriangleAlert className="h-3 w-3" /> : null}
          {shelf.label}
          {row.low ? <span className="text-[#C4847A]">Low</span> : null}
          {row.isMarkdown ? (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-200">
              MARKDOWN · 30% off
            </span>
          ) : null}
        </span>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 sm:w-[17rem] sm:justify-end">
        <button
          type="button"
          disabled={busy}
          onClick={onKitchen}
          className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#163832] px-3 text-xs font-black text-[#7dcec4] disabled:opacity-50 sm:flex-none"
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          Kitchen
        </button>
        <button
          type="button"
          disabled={busy || row.isMarkdown}
          onClick={onMarkdown}
          className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500/15 px-3 text-xs font-black text-amber-300 disabled:opacity-50 sm:flex-none"
        >
          <Tag className="h-3.5 w-3.5" />
          30% off
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onWaste}
          className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#C4847A]/15 px-3 text-xs font-black text-[#C4847A] disabled:opacity-50 sm:flex-none"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Waste
        </button>
      </div>
    </li>
  );
}

export function SlateInventory({ levels: initialLevels }: { levels: StockLevel[] | null }) {
  const loading = initialLevels === null;
  const router = useRouter();
  const [levels, setLevels] = useState<StockLevel[]>(() => initialLevels ?? []);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState<string>('ALL');
  const [pullDays, setPullDays] = useState(3);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { activeUser } = useRole();

  useEffect(() => {
    if (!initialLevels) return;
    setLevels(initialLevels);
  }, [initialLevels]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const onHand = useMemo(() => levels.filter((row) => row.onHand > 0), [levels]);

  const matchesFilters = (row: StockLevel) => {
    const dept = departmentForName(row.name);
    if (department !== 'ALL' && dept !== department) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      row.name.toLowerCase().includes(needle) || row.supplier.toLowerCase().includes(needle)
    );
  };

  const actionQueue = useMemo(
    () =>
      onHand
        .filter(
          (row) =>
            matchesFilters(row) &&
            (row.daysRemaining <= pullDays || row.low || row.isMarkdown)
        )
        .sort((a, b) => a.daysRemaining - b.daysRemaining || a.name.localeCompare(b.name)),
    [onHand, pullDays, department, query]
  );

  const fullCatalog = useMemo(
    () =>
      onHand
        .filter((row) => matchesFilters(row) && !actionQueue.some((q) => q.productId === row.productId))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [onHand, actionQueue, department, query]
  );

  const flaggedForMetrics = onHand.filter(
    (row) => row.daysRemaining <= pullDays || row.low || row.isMarkdown
  );

  const totalValueAtRisk = flaggedForMetrics.reduce(
    (sum, row) => sum + row.onHand * row.unitCost,
    0
  );
  const lowCount = onHand.filter((row) => row.low).length;
  const markdownCount = onHand.filter((row) => row.isMarkdown).length;
  const kitchenRoutedCount = onHand.filter((row) => row.kitchenPrepQty > 0).length;

  const patchLevel = (level: StockLevel) => {
    setLevels((current) =>
      current.map((item) => (item.productId === level.productId ? level : item))
    );
  };

  const postMove = async (row: StockLevel, action: 'waste' | 'rescue' | 'markdown') => {
    setPendingId(row.productId);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/inventory/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: row.productId,
          action,
          staffId: activeUser?.id ?? '',
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success || !json.level) {
        setErrorMessage(json.error || 'The update could not be saved.');
        return;
      }
      const level = json.level as StockLevel;
      patchLevel(level);

      if (action === 'markdown') {
        setToast(
          `${row.name}: shelf price ${formatCurrency(level.regularRetailPrice ?? row.retailPrice ?? 0)} → ${formatCurrency(level.retailPrice ?? 0)} (30% off).`
        );
        return;
      }

      const units = Number(json.units);
      const amount = `${formatUnits(Number.isFinite(units) ? units : row.onHand)} ${stockUnitLabel(row.unitType)}`;
      setToast(
        action === 'waste'
          ? `${row.name}: ${amount} discarded from the floor.`
          : `${row.name}: ${amount} moved to kitchen · floor now ${formatUnits(level.onHand)} ${stockUnitLabel(row.unitType)}.`
      );
    } catch {
      setErrorMessage('The update could not be saved.');
    } finally {
      setPendingId(null);
    }
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
            Ledger on-hand is what is on the retail floor. Pull short-dated cases, markdown, send to
            kitchen, or discard — all from one list.
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

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 shadow-xl backdrop-blur-md">
        <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-white sm:text-lg">
              Short-dated &amp; action board
              <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                {actionQueue.length} flagged
              </span>
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400 sm:text-xs">
              {loading
                ? 'Reading on-hand stock…'
                : `Expiring within ${pullDays} days, below par, or marked down.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
        </div>

        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }, (_, index) => (
              <span key={index} className="block h-16 animate-pulse rounded-xl bg-slate-800/80" />
            ))}
          </div>
        ) : (
          <ul>
            {actionQueue.map((row) => (
              <StockRow
                key={row.productId}
                row={row}
                busy={pendingId === row.productId}
                onKitchen={() => void postMove(row, 'rescue')}
                onMarkdown={() => void postMove(row, 'markdown')}
                onWaste={() => void postMove(row, 'waste')}
              />
            ))}
            {actionQueue.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-slate-400">
                {query || department !== 'ALL'
                  ? 'Nothing matches filters in the action window.'
                  : 'No short-dated pulls right now — expand the pull window or check full catalog below.'}
              </li>
            ) : null}
          </ul>
        )}
      </div>

      {!loading && fullCatalog.length > 0 ? (
        <details className="group overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-4 text-sm font-bold text-slate-200 marker:content-none">
            <span>Full on-hand catalog ({fullCatalog.length})</span>
            <ChevronDown className="h-4 w-4 text-slate-500 transition group-open:rotate-180" />
          </summary>
          <ul className="border-t border-slate-800">
            {fullCatalog.map((row) => (
              <StockRow
                key={row.productId}
                row={row}
                busy={pendingId === row.productId}
                onKitchen={() => void postMove(row, 'rescue')}
                onMarkdown={() => void postMove(row, 'markdown')}
                onWaste={() => void postMove(row, 'waste')}
              />
            ))}
          </ul>
        </details>
      ) : null}

      {errorMessage ? <p className="text-sm font-bold text-[#C4847A]">{errorMessage}</p> : null}
      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-2xl border border-slate-700 bg-slate-900/95 px-4 py-3 text-sm font-bold text-slate-100 shadow-xl backdrop-blur md:bottom-8">
          {toast}
        </div>
      ) : null}
    </section>
  );
}
