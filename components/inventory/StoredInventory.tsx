'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { AppShell } from '@/components/shell/AppShell';
import { PageIntro } from '@/components/shell/PageIntro';
import { formatUnits, stockUnitLabel } from '@/lib/yieldPricing';
import type { StockLevel } from '@/lib/stock';

interface LevelsResponse {
  success: boolean;
  levels: StockLevel[];
  error?: string;
}

function casesLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function StoredInventory() {
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/inventory/levels', { cache: 'no-store' });
        const json = (await response.json()) as LevelsResponse;
        if (cancelled) return;
        if (!response.ok || !json.success) {
          setError(json.error || 'Stored inventory could not be read.');
          return;
        }
        setLevels(json.levels);
      } catch {
        if (!cancelled) setError('Stored inventory could not be read.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stored = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return levels
      .filter((row) => row.onHand > 0)
      .filter((row) => {
        if (!needle) return true;
        return (
          row.name.toLowerCase().includes(needle) ||
          row.supplier.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => b.onHand - a.onHand || a.name.localeCompare(b.name));
  }, [levels, query]);

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-7xl px-3 py-5 pb-28 sm:px-6 sm:py-8">
        <PageIntro
          step="Inventory"
          title="What is in stock"
          description="Each case saved on Receive is stored here as retail units. The count is the ledger total, not a separate stock column."
        />

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-300">
            {loading
              ? 'Reading stored stock…'
              : `${stored.length} ${stored.length === 1 ? 'item' : 'items'} in stock`}
          </p>
          <label className="relative block w-full sm:w-72">
            <span className="sr-only">Search stored inventory</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search item or supplier"
              className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-emerald-400/70"
            />
          </label>
        </div>

        {error ? (
          <p className="mt-4 rounded-2xl border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
            {error}
          </p>
        ) : null}

        <div className="mt-4 overflow-x-auto rounded-3xl border border-zinc-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-zinc-900 text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3 text-right">In stock</th>
                <th className="px-4 py-3 text-right">Cases</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 bg-zinc-950">
              {stored.map((row) => (
                <tr key={row.productId}>
                  <td className="px-4 py-3 font-bold text-white">{row.name}</td>
                  <td className="px-4 py-3 text-zinc-400">{row.supplier}</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-300">
                    {formatUnits(row.onHand)} {stockUnitLabel(row.unitType)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-300">
                    {casesLabel(row.onHandCases)}
                  </td>
                </tr>
              ))}
              {!loading && stored.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-zinc-400">
                    {query ? 'Nothing stored matches that search.' : 'Nothing is stored yet. Save a case on Receive.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </main>
    </AppShell>
  );
}
