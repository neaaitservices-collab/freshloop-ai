'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Package, Search } from 'lucide-react';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { PageMain } from '@/components/ui/layout';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import { formatCurrency, formatUnits, stockUnitLabel } from '@/lib/domains/receiving/yieldPricing';
import { cn } from '@/lib/utils/cn';
import { fieldMatchesNeedle } from '@/lib/utils/searchNeedle';

export function ClerkStockView({
  levels: initialLevels,
  highlightProductId,
}: {
  levels: StockLevel[] | null;
  highlightProductId?: string | null;
}) {
  const loading = initialLevels === null;
  const [levels, setLevels] = useState<StockLevel[]>(() => initialLevels ?? []);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (initialLevels) setLevels(initialLevels);
  }, [initialLevels]);

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
  }, []);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return levels
      .filter((row) => row.onHand > 0 || row.kitchenPrepQty > 0)
      .filter((row) => {
        if (!needle) return true;
        return (
          fieldMatchesNeedle(row.name, needle) ||
          fieldMatchesNeedle(row.supplier, needle)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [levels, query]);

  useEffect(() => {
    if (!highlightProductId) return;
    window.setTimeout(() => {
      document.getElementById('stock-highlight')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }, 200);
  }, [highlightProductId, rows.length]);

  return (
    <PageMain width="lg" className="bg-slate-950">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300/80">
            After receive
          </p>
          <h1 className="text-xl font-black text-slate-100 sm:text-2xl">Verify posted stock</h1>
          <p className="mt-1 max-w-lg text-sm text-slate-400">
            Read-only view to confirm cases saved from receiving appear on the ledger. To price new
            delivery lines, go back to{' '}
            <Link href="/receive" className="font-bold text-blue-300 hover:underline">
              Receive
            </Link>
            .
          </p>
        </div>
        <Link href="/receive">
          <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-3 text-xs font-bold text-slate-200">
            <Package className="h-4 w-4" />
            Receive
          </span>
        </Link>
      </div>

      <label className="relative mb-4 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search item…" className="pl-9" />
      </label>

      {loading ? (
        <Card>
          <CardBody className="space-y-2 py-6">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-800/80" />
            ))}
          </CardBody>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="border-dashed">
          <CardBody className="py-12 text-center">
            <p className="text-sm font-bold text-slate-200">No stock on hand yet</p>
            <p className="mt-2 text-sm text-slate-400">
              Save cases on the receiving board to see them here.
            </p>
            <Link
              href="/receive"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-900/40 px-4 py-2.5 text-sm font-bold text-slate-100 border border-blue-800"
            >
              Back to receive
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>On hand</CardTitle>
            <CardDescription>{rows.length} SKUs with balance · ledger snapshot</CardDescription>
          </CardHeader>
          <ul className="divide-y divide-slate-800/80">
            {rows.map((row) => {
              const highlighted = highlightProductId === row.productId;
              return (
                <li
                  key={row.productId}
                  id={highlighted ? 'stock-highlight' : undefined}
                  className={cn(
                    'flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
                    highlighted && 'bg-blue-950/30 ring-1 ring-inset ring-blue-800/80'
                  )}
                >
                  <div>
                    <p className="font-bold text-slate-100">{row.name}</p>
                    <p className="text-[11px] text-slate-500">{row.supplier || '—'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-right">
                    <span className="font-mono text-sm font-bold text-slate-200">
                      {formatUnits(row.onHand)} {stockUnitLabel(row.unitType)} floor
                    </span>
                    {row.retailPrice !== null ? (
                      <span className="text-[11px] text-slate-400">{formatCurrency(row.retailPrice)}</span>
                    ) : null}
                    {row.low ? <Badge variant="warning">Low</Badge> : null}
                    {highlighted ? <Badge variant="ocean">Just posted</Badge> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </PageMain>
  );
}
