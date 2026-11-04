'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import {
  catalogCaseFloorPrice,
  caseCostForPricing,
  formatCurrency,
  formatPercent,
  formatUnits,
  marginAtCaseFloorPrice,
  stockUnitLabel,
} from '@/lib/domains/receiving/yieldPricing';
import { ScrollTable } from '@/components/ui/layout';
import { cn } from '@/lib/utils/cn';

function caseCost(row: StockLevel): number {
  const pack = row.casePackSize > 0 ? row.casePackSize : 1;
  return caseCostForPricing({
    standardCost: row.unitCost,
    packSize: pack,
    yieldDivisor: 1,
  });
}

function casePrice(row: StockLevel): number | null {
  return catalogCaseFloorPrice({
    unitCostPerSellable: row.unitCost,
    casePackSize: row.casePackSize,
    retailPrice: row.retailPrice,
  });
}

function marginPct(row: StockLevel): number | null {
  const price = casePrice(row);
  if (price === null || price <= 0) return null;
  return marginAtCaseFloorPrice(price, caseCost(row));
}

export function InventoryDataGrid({
  groups,
  loading,
  onSelect,
}: {
  groups: Array<{ key: string; label: string; rows: StockLevel[] }>;
  loading: boolean;
  onSelect: (row: StockLevel) => void;
}) {
  if (loading) {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="mb-2 h-10 animate-pulse rounded-lg bg-slate-800/80" />
        ))}
      </div>
    );
  }

  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  if (total === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-12 text-center text-sm text-slate-400">
        No items match these filters. Try reset or receive product on Receive.
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/50 shadow-lg shadow-black/10">
      <ScrollTable>
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-950/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3 text-right">On hand</th>
              <th className="px-4 py-3 text-right">Margin</th>
              <th className="px-4 py-3 text-right">Case price</th>
              <th className="px-4 py-3 text-right">Shelf</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <GroupBlock key={group.key} group={group} onSelect={onSelect} />
            ))}
          </tbody>
        </table>
      </ScrollTable>
    </div>
  );
}

function GroupBlock({
  group,
  onSelect,
}: {
  group: { key: string; label: string; rows: StockLevel[] };
  onSelect: (row: StockLevel) => void;
}) {
  const [open, setOpen] = useState(true);
  const multi = group.key !== 'all';

  return (
    <>
      {multi ? (
        <tr className="bg-slate-950/60">
          <td colSpan={6} className="px-4 py-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex w-full items-center gap-2 text-left text-xs font-black uppercase tracking-wide text-slate-300"
            >
              <ChevronDown className={cn('h-4 w-4 transition', open && 'rotate-180')} />
              {group.label}
              <span className="font-mono text-slate-500">({group.rows.length})</span>
            </button>
          </td>
        </tr>
      ) : null}
      {open
        ? group.rows.map((row, index) => {
            const floorCasePrice = casePrice(row);
            return (
            <tr
              key={row.productId}
              onClick={() => onSelect(row)}
              className={cn(
                'cursor-pointer border-b border-slate-800/60 transition hover:bg-slate-800/50',
                index % 2 === 0 ? 'bg-slate-900/20' : 'bg-transparent'
              )}
            >
              <td className="px-4 py-3">
                <p className="font-bold text-slate-100">{row.name}</p>
                <p className="text-[11px] text-slate-500">{row.category}</p>
              </td>
              <td className="px-4 py-3 text-slate-400">{row.supplier}</td>
              <td className="px-4 py-3 text-right font-mono text-slate-200">
                {formatUnits(row.onHand)} {stockUnitLabel(row.unitType)}
                {row.onHand <= 0 ? (
                  <span className="ml-2 rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
                    Out of stock
                  </span>
                ) : null}
                {row.low && row.onHand > 0 ? (
                  <span className="ml-2 rounded-md bg-rose-950/80 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
                    Low
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-right font-mono text-emerald-300/90">
                {marginPct(row) === null ? '—' : `${formatPercent(marginPct(row)!)}%`}
              </td>
              <td className="px-4 py-3 text-right font-mono text-slate-300">
                {floorCasePrice === null ? '—' : formatCurrency(floorCasePrice)}
              </td>
              <td className="px-4 py-3 text-right text-xs text-slate-500">{row.daysRemaining}d</td>
            </tr>
            );
          })
        : null}
    </>
  );
}
