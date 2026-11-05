'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import { itemOriginLabel } from '@/components/features/inventory/RetailFloorItemCardMeta';
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

const CATALOG_COLUMN_COUNT = 7;

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

function CatalogItemCard({ row, onSelect }: { row: StockLevel; onSelect: () => void }) {
  const floorCasePrice = casePrice(row);
  const margin = marginPct(row);
  const unit = stockUnitLabel(row.unitType);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-xl border border-slate-800/90 bg-slate-950/70 p-3 text-left transition hover:border-slate-700 hover:bg-slate-900/80 active:scale-[0.99]"
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-100">{row.name}</p>
          <p className="truncate text-[11px] text-slate-500">{row.category}</p>
        </div>
        {row.low && row.onHand > 0 ? (
          <span className="shrink-0 rounded-md bg-rose-950/80 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
            Low
          </span>
        ) : null}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
        <div className="min-w-0">
          <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Supplier</dt>
          <dd className="truncate text-slate-300" title={row.supplier}>
            {row.supplier}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Origin</dt>
          <dd className="truncate font-semibold text-slate-200" title={itemOriginLabel(row)}>
            {itemOriginLabel(row)}
          </dd>
        </div>
        <div>
          <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">On hand</dt>
          <dd className="font-mono font-bold tabular-nums text-slate-200">
            {formatUnits(row.onHand)} {unit}
            {row.onHand <= 0 ? (
              <span className="ml-1 text-[10px] font-bold text-slate-500">Out</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Margin</dt>
          <dd className="font-mono font-bold tabular-nums text-emerald-300/90">
            {margin === null ? '—' : `${formatPercent(margin)}%`}
          </dd>
        </div>
        <div>
          <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Case price</dt>
          <dd className="font-mono tabular-nums text-slate-300">
            {floorCasePrice === null ? '—' : formatCurrency(floorCasePrice)}
          </dd>
        </div>
        <div>
          <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Shelf</dt>
          <dd className="font-mono tabular-nums text-slate-400">{row.daysRemaining}d</dd>
        </div>
      </dl>
    </button>
  );
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
      <div className="space-y-2 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-3 md:p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-800/80 md:h-10" />
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
      <div className="space-y-3 p-3 md:hidden">
        {groups.map((group) => (
          <MobileGroupBlock key={group.key} group={group} onSelect={onSelect} />
        ))}
      </div>

      <ScrollTable className="hidden md:block">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-950/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Origin</th>
              <th className="px-4 py-3 text-right">On hand</th>
              <th className="px-4 py-3 text-right">Margin</th>
              <th className="px-4 py-3 text-right">Case price</th>
              <th className="px-4 py-3 text-right">Shelf</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <GroupTableBlock key={group.key} group={group} onSelect={onSelect} />
            ))}
          </tbody>
        </table>
      </ScrollTable>
    </div>
  );
}

function MobileGroupBlock({
  group,
  onSelect,
}: {
  group: { key: string; label: string; rows: StockLevel[] };
  onSelect: (row: StockLevel) => void;
}) {
  const multi = group.key !== 'all';
  const [open, setOpen] = useState(true);

  return (
    <section className="min-w-0">
      {multi ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mb-2 flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-left text-xs font-black uppercase tracking-wide text-slate-300"
        >
          <ChevronDown className={cn('h-4 w-4 shrink-0 transition', open && 'rotate-180')} />
          {group.label}
          <span className="font-mono text-slate-500">({group.rows.length})</span>
        </button>
      ) : null}
      {open ? (
        <ul className="space-y-2">
          {group.rows.map((row) => (
            <li key={row.productId}>
              <CatalogItemCard row={row} onSelect={() => onSelect(row)} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function GroupTableBlock({
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
          <td colSpan={CATALOG_COLUMN_COUNT} className="px-4 py-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex min-h-11 w-full items-center gap-2 text-left text-xs font-black uppercase tracking-wide text-slate-300"
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
                <td className="max-w-[10rem] px-4 py-3">
                  <span className="block truncate text-slate-400" title={row.supplier}>
                    {row.supplier}
                  </span>
                </td>
                <td className="max-w-[8rem] px-4 py-3">
                  <span
                    className="block truncate font-semibold text-slate-300"
                    title={itemOriginLabel(row)}
                  >
                    {itemOriginLabel(row)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-200">
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
                <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-300/90">
                  {marginPct(row) === null ? '—' : `${formatPercent(marginPct(row)!)}%`}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-300">
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
