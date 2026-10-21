'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Printer } from 'lucide-react';
import { AppShell } from '@/components/shell/AppShell';
import { PageIntro } from '@/components/shell/PageIntro';
import { formatCurrency, formatUnits, stockUnitLabel } from '@/lib/yieldPricing';
import { stockFromPar } from '@/lib/parLevel';
import type { StockLevel } from '@/lib/stock';

interface LevelsResponse {
  success: boolean;
  parCases: number;
  lowCount: number;
  orderCost: number;
  levels: StockLevel[];
  error?: string;
}

function casesLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function withPar(row: StockLevel, parCases: number): StockLevel {
  return {
    ...row,
    ...stockFromPar({
      onHand: row.onHand,
      casePackSize: row.casePackSize,
      unitCost: row.unitCost,
      parCases,
    }),
  };
}

export function BuyList() {
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const saveTimers = useRef<Record<string, number>>({});
  const [printedAt] = useState(() =>
    new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/inventory/levels', { cache: 'no-store' });
        const json = (await response.json()) as LevelsResponse;
        if (cancelled) return;
        if (!response.ok || !json.success) {
          setError(json.error || 'Stock levels could not be read.');
          return;
        }
        setLevels(json.levels);
      } catch {
        if (!cancelled) setError('Stock levels could not be read.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const low = levels.filter((row) => row.low);
  const groups = useMemo(() => {
    const bySupplier = new Map<string, StockLevel[]>();
    for (const row of low) {
      const list = bySupplier.get(row.supplier) ?? [];
      list.push(row);
      bySupplier.set(row.supplier, list);
    }
    return Array.from(bySupplier.entries());
  }, [low]);
  const orderCost = low.reduce((sum, row) => sum + row.orderCost, 0);

  const changePar = (productId: string, raw: string) => {
    const parCases = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(parCases)) return;
    let nextRow: StockLevel | null = null;
    setLevels((current) =>
      current.map((row) => {
        if (row.productId !== productId) return row;
        nextRow = withPar(row, parCases);
        return nextRow;
      })
    );
    window.clearTimeout(saveTimers.current[productId]);
    saveTimers.current[productId] = window.setTimeout(() => {
      if (nextRow) void savePar(nextRow);
    }, 400);
  };

  const savePar = async (row: StockLevel) => {
    setSavingId(row.productId);
    setError(null);
    try {
      const response = await fetch('/api/inventory/levels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: row.productId, parCases: row.parCases }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(json.error || 'The alert level could not be saved.');
        return;
      }
      setLevels((current) => current.map((item) => (item.productId === row.productId ? json.level : item)));
    } catch {
      setError('The alert level could not be saved.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <AppShell>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #order-sheet, #order-sheet * { visibility: visible; }
          #order-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white;
            color: black;
          }
        }
      `}</style>
      <main className="mx-auto w-full max-w-5xl px-3 py-5 pb-28 sm:px-6 sm:py-8">
        <div className="no-print">
          <PageIntro
            step="Stock"
            title="What to buy"
            description="On-hand stock comes from the ledger. Edit the alert column to choose how many cases to keep. Anything below that lands on the supplier order."
            action={
              <button
                type="button"
                onClick={() => window.print()}
                disabled={low.length === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-zinc-950 disabled:bg-zinc-800 disabled:text-zinc-500 sm:w-auto"
              >
                <Printer className="h-4 w-4" />
                Print order PDF
              </button>
            }
          />

          {error ? (
            <p className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
              {error}
            </p>
          ) : null}

          <section
            className={`mt-5 rounded-3xl border p-5 ${
              low.length > 0 ? 'border-amber-500/40 bg-amber-500/10' : 'border-emerald-500/30 bg-emerald-500/10'
            }`}
          >
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              Low stock
            </p>
            <p className={`mt-1 font-mono text-4xl font-black ${low.length > 0 ? 'text-amber-200' : 'text-emerald-300'}`}>
              {loading ? '—' : low.length}
            </p>
            <p className="mt-1 text-sm text-zinc-300">
              {loading
                ? 'Reading the ledger…'
                : low.length > 0
                  ? `${formatCurrency(orderCost)} suggested across ${groups.length} supplier${groups.length === 1 ? '' : 's'}.`
                  : 'Every item is at or above its alert level.'}
            </p>
          </section>

          <div className="mt-5 overflow-x-auto rounded-3xl border border-zinc-800">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-zinc-900 text-[11px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3 text-right">On hand</th>
                  <th className="px-4 py-3 text-right">Alert</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 bg-zinc-950">
                {levels.map((row) => (
                  <tr key={row.productId}>
                    <td className="px-4 py-3 font-bold text-white">{row.name}</td>
                    <td className="px-4 py-3 text-zinc-400">{row.supplier}</td>
                    <td className="px-4 py-3 text-right font-mono text-zinc-200">
                      <span className="block">{formatUnits(row.onHand)} {stockUnitLabel(row.unitType)}</span>
                      <span className="text-[11px] text-zinc-500">{casesLabel(row.onHandCases)} cases</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min={0}
                        max={999}
                        step={1}
                        inputMode="numeric"
                        aria-label={`Alert level for ${row.name}`}
                        value={row.parCases}
                        onChange={(event) => changePar(row.productId, event.target.value)}
                        onBlur={(event) => void savePar(withPar(row, Number(event.target.value)))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                        className="w-16 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-right font-mono text-sm text-white"
                      />
                      {savingId === row.productId ? (
                        <span className="mt-1 block text-[10px] text-zinc-500">Saving</span>
                      ) : null}
                    </td>
                    <td className={`px-4 py-3 font-bold ${row.low ? 'text-amber-300' : 'text-emerald-300'}`}>
                      {row.low ? `Order ${row.orderCases}` : 'In stock'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <article id="order-sheet" className="mt-8 rounded-3xl border border-zinc-800 bg-white p-6 text-zinc-950">
          <header className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-300 pb-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">FreshLoop</p>
              <h2 className="text-2xl font-black">Purchase order recommendation</h2>
              <p className="text-sm text-zinc-600">Buy list by supplier · alert level set per item</p>
            </div>
            <p className="text-sm text-zinc-600">{printedAt}</p>
          </header>

          {groups.length === 0 ? (
            <p className="py-8 text-sm text-zinc-600">No cases to order.</p>
          ) : (
            groups.map(([supplier, rows]) => {
              const subtotal = rows.reduce((sum, row) => sum + row.orderCost, 0);
              return (
                <section key={supplier} className="mt-6">
                  <h3 className="text-lg font-black">{supplier}</h3>
                  <table className="mt-2 w-full text-left text-sm">
                    <thead className="text-[11px] uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="py-2">Item</th>
                        <th className="py-2 text-right">On hand</th>
                        <th className="py-2 text-right">Order</th>
                        <th className="py-2 text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.productId} className="border-t border-zinc-200">
                          <td className="py-2 font-semibold">{row.name}</td>
                          <td className="py-2 text-right">
                            {formatUnits(row.onHand)} {stockUnitLabel(row.unitType)}
                            <span className="block text-[11px] text-zinc-500">{casesLabel(row.onHandCases)} cases</span>
                          </td>
                          <td className="py-2 text-right">{row.orderCases} cases</td>
                          <td className="py-2 text-right font-mono">{formatCurrency(row.orderCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-zinc-400">
                        <td className="py-2 font-bold" colSpan={3}>
                          {supplier} total
                        </td>
                        <td className="py-2 text-right font-mono font-bold">{formatCurrency(subtotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </section>
              );
            })
          )}

          <p className="mt-6 border-t border-zinc-300 pt-3 text-right text-base font-black">
            Order total {formatCurrency(orderCost)}
          </p>
        </article>
      </main>
    </AppShell>
  );
}
