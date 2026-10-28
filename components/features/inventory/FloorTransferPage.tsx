'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Search } from 'lucide-react';
import { useRole } from '@/components/auth/RoleProvider';
import { RetailFloorTransferPanel } from '@/components/features/inventory/RetailFloorTransferPanel';
import { PullSliderControl } from '@/components/ui/PullSliderControl';
import { Toast } from '@/components/ui/Toast';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import type { DepartmentType } from '@/lib/types';
import { useOptimisticInventoryLevels } from '@/hooks/use-optimistic-inventory-levels';

const DEPARTMENTS: DepartmentType[] = ['PRODUCE', 'DAIRY', 'BAKERY', 'PANTRY'];

function departmentForName(name: string): DepartmentType {
  const lower = name.toLowerCase();
  if (/cream|milk|yogurt|cheese|butter|egg/.test(lower)) return 'DAIRY';
  if (/bread|sourdough|boule|loaf|pastry|bun|bakery/.test(lower)) return 'BAKERY';
  if (/oil|olive|spice|grain|rice|pasta|sauce/.test(lower)) return 'PANTRY';
  return 'PRODUCE';
}

export function FloorTransferPage({ levels: initialLevels }: { levels: StockLevel[] | null }) {
  const loading = initialLevels === null;
  const router = useRouter();
  const { levels, performMove, setLevels } = useOptimisticInventoryLevels(initialLevels);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState<string>('ALL');
  const [pullDays, setPullDays] = useState(3);
  const [toast, setToast] = useState<{ text: string; kitchen?: boolean } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { activeUser } = useRole();

  useEffect(() => {
    const sync = () => {
      void fetch('/api/inventory/levels', { cache: 'no-store' })
        .then((r) => r.json())
        .then((json) => {
          if (json.success && Array.isArray(json.levels)) {
            setLevels(json.levels as StockLevel[]);
          }
        });
    };
    window.addEventListener('freshloop-inventory-updated', sync);
    return () => window.removeEventListener('freshloop-inventory-updated', sync);
  }, [setLevels]);

  const departmentFilter = useCallback(
    (row: StockLevel) => department === 'ALL' || departmentForName(row.name) === department,
    [department]
  );

  const flaggedCount = useMemo(
    () =>
      levels.filter(
        (row) =>
          row.onHand > 0 &&
          (row.daysRemaining <= pullDays || row.low || row.isMarkdown)
      ).length,
    [levels, pullDays]
  );

  const handleSuccess = (message: string, level: StockLevel) => {
    setErrorMessage(null);
    setToast({
      text: message,
      kitchen: /sent to kitchen/i.test(message),
    });
    router.refresh();
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-3 py-5 pb-28 sm:px-6 sm:py-8">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-500/90">
            Retail floor · Clerk transfers
          </p>
          <h1 className="text-xl font-black text-slate-100 sm:text-2xl">Move shelf stock</h1>
          <p className="mt-1 max-w-lg text-xs text-slate-400">
            Send to production, mark down, or waste — pick the amount in lbs or units. Production prep is
            managed on{' '}
            <Link href="/kitchen" className="text-amber-300 underline">
              Production
            </Link>
            .
          </p>
        </div>
        <Link
          href="/kitchen?inbox=1"
          className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-blue-900/50 bg-blue-950/30 px-4 py-3 text-xs font-bold text-blue-200"
        >
          Production inbox
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <PullSliderControl
        currentPullDays={pullDays}
        onPullDaysChange={setPullDays}
        affectedCount={flaggedCount}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-300"
        >
          <option value="ALL">All departments</option>
          {DEPARTMENTS.map((dept) => (
            <option key={dept} value={dept}>
              {dept.charAt(0) + dept.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <label className="relative block min-h-12 flex-1 min-w-[12rem] sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search item…"
            className="h-full w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-xs text-slate-200"
          />
        </label>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-800/80" />
          ))}
        </div>
      ) : (
        <>
          <RetailFloorTransferPanel
            levels={levels}
            pullDays={pullDays}
            staffId={activeUser?.id}
            priorityOnly
            query={query}
            departmentFilter={departmentFilter}
            performMove={performMove}
            onSuccess={handleSuccess}
            onError={setErrorMessage}
          />
          <details className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60">
            <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-300">
              All floor items
            </summary>
            <RetailFloorTransferPanel
              levels={levels}
              pullDays={pullDays}
              staffId={activeUser?.id}
              priorityOnly={false}
              query={query}
              departmentFilter={departmentFilter}
              compact
              performMove={performMove}
              onSuccess={handleSuccess}
              onError={setErrorMessage}
            />
          </details>
        </>
      )}

      <Toast
        message={errorMessage}
        onDismiss={() => setErrorMessage(null)}
        variant="destructive"
      />

      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-2xl border border-slate-700 bg-slate-900/95 px-4 py-3 text-sm font-bold text-slate-100 shadow-xl md:bottom-8">
          <p>{toast.text}</p>
          {toast.kitchen ? (
            <Link
              href="/kitchen?inbox=1"
              className="mt-2 inline-flex min-h-11 items-center text-xs font-bold text-blue-300 underline-offset-2 hover:underline"
            >
              Open kitchen inbox
            </Link>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
