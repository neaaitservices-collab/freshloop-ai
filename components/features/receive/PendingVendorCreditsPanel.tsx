'use client';

import React from 'react';
import { CheckCircle2, Loader2, PackageX } from 'lucide-react';
import type { ReceivingDispositionRow } from '@/lib/domains/receiving/receivingDisposition';
import { formatCurrency } from '@/lib/domains/receiving/yieldPricing';

export function PendingVendorCreditsPanel({
  items,
  resolvingId,
  onMarkCredited,
}: {
  items: ReceivingDispositionRow[];
  resolvingId: string | null;
  onMarkCredited: (id: string) => void;
}) {
  if (items.length === 0) return null;

  const totalCases = items.reduce((sum, row) => sum + row.casesReceived, 0);
  const totalValue = items.reduce((sum, row) => sum + row.casesReceived * row.caseCost, 0);

  return (
    <section className="mb-5 overflow-hidden rounded-3xl border border-amber-500/30 bg-amber-950/20">
      <div className="flex flex-col gap-2 border-b border-amber-500/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <PackageX className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div>
            <h2 className="text-sm font-black text-amber-100">Pending vendor credit (not received)</h2>
            <p className="text-[11px] text-amber-200/70">
              {items.length} line{items.length === 1 ? '' : 's'} · {totalCases} cases ·{' '}
              {formatCurrency(totalValue)} at case cost
            </p>
          </div>
        </div>
      </div>
      <ul className="divide-y divide-amber-500/10">
        {items.map((row) => (
          <li
            key={row.id}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{row.itemName}</p>
              <p className="text-[11px] text-zinc-400">
                {row.casesReceived} cases · {formatCurrency(row.caseCost)}/case · added{' '}
                {new Date(row.createdAt).toLocaleDateString()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onMarkCredited(row.id)}
              disabled={resolvingId === row.id}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/50 px-3 py-2 text-[11px] font-bold text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-50"
            >
              {resolvingId === row.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Mark credited
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
