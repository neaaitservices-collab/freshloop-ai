'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import { itemOriginLabel } from '@/components/features/inventory/RetailFloorItemCardMeta';
import {
  catalogDisplayCaseCost,
  formatCurrency,
  formatUnits,
  stockUnitLabel,
} from '@/lib/domains/receiving/yieldPricing';
import { ScrollTable } from '@/components/ui/layout';
import { OfflineSyncBadge } from '@/components/ui/OfflineSyncBadge';
import { cn } from '@/lib/utils/cn';

const CATALOG_COLUMN_COUNT = 7;

const TH =
  'px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap';

function packForPricing(row: StockLevel): number {
  return row.receivePackSize > 0 ? row.receivePackSize : row.casePackSize > 0 ? row.casePackSize : 1;
}

function splitForPricing(row: StockLevel): number {
  return row.splitFactor > 0 ? row.splitFactor : 1;
}

function displayCaseCost(row: StockLevel): string {
  const cost = catalogDisplayCaseCost({
    receiveCaseCost: row.receiveCaseCost,
    standardCost: row.unitCost,
    packSize: packForPricing(row),
    splitFactor: splitForPricing(row),
  });
  return cost > 0 ? formatCurrency(cost) : '—';
}

function shelfTone(row: StockLevel): { cell: string; sub?: React.ReactNode } {
  const inPullWindow = row.daysRemaining <= row.pullDays;
  return {
    cell: cn(
      'font-mono tabular-nums',
      inPullWindow ? 'font-bold text-amber-300' : 'text-slate-500'
    ),
    sub: inPullWindow ? (
      <span className="ml-1 text-[10px] font-bold text-amber-400/90">≤{row.pullDays}d pull</span>
    ) : undefined,
  };
}

function OnHandBadges({ row }: { row: StockLevel }) {
  return (
    <>
      {row.onHand <= 0 ? (
        <span className="ml-2 rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
          Out
        </span>
      ) : null}
      {row.low && row.onHand > 0 ? (
        <span className="ml-2 rounded-md bg-rose-950/80 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
          Low
        </span>
      ) : null}
    </>
  );
}

function CatalogItemCard({ row, onSelect }: { row: StockLevel; onSelect: () => void }) {
  const unit = stockUnitLabel(row.unitType);
  const shelf = shelfTone(row);

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
        <div className="min-w-0 sm:col-span-2">
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
          <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">On cases</dt>
          <dd className="font-mono tabular-nums text-slate-300">
            {row.onHandCases > 0 ? `${formatUnits(row.onHandCases)} cases` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">On hand</dt>
          <dd className="font-mono font-bold tabular-nums text-slate-200">
            {row.onHand > 0 ? (
              <>
                {formatUnits(row.onHand)} {unit}
              </>
            ) : (
              <span className="text-slate-500">—</span>
            )}
            <OnHandBadges row={row} />
          </dd>
        </div>
        <div>
          <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Case cost</dt>
          <dd className="font-mono tabular-nums text-slate-300">{displayCaseCost(row)}</dd>
        </div>
        <div>
          <dt className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Shelf life</dt>
          <dd className={cn('text-xs', shelf.cell)}>
            {row.daysRemaining}d{shelf.sub}
          </dd>
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
      <div className="flex items-center justify-end border-b border-slate-800/80 px-3 py-2">
        <OfflineSyncBadge />
      </div>
      <div className="space-y-3 p-3 md:hidden">
        {groups.map((group) => (
          <MobileGroupBlock key={group.key} group={group} onSelect={onSelect} />
        ))}
      </div>

      <ScrollTable className="hidden md:block">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 backdrop-blur-sm">
            <tr>
              <th scope="col" className={cn(TH, 'min-w-[11rem]')}>
                Item
              </th>
              <th scope="col" className={cn(TH, 'min-w-[7rem]')}>
                Supplier
              </th>
              <th scope="col" className={cn(TH, 'min-w-[5.5rem]')}>
                Origin
              </th>
              <th scope="col" className={cn(TH, 'text-right')}>
                On cases
              </th>
              <th scope="col" className={cn(TH, 'text-right')}>
                On hand
              </th>
              <th scope="col" className={cn(TH, 'text-right')}>
                Case cost
              </th>
              <th scope="col" className={cn(TH, 'text-right')}>
                Shelf life
              </th>
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
            const shelf = shelfTone(row);
            const unit = stockUnitLabel(row.unitType);

            return (
              <tr
                key={row.productId}
                onClick={() => onSelect(row)}
                className={cn(
                  'cursor-pointer border-b border-slate-800/60 transition hover:bg-slate-800/50',
                  index % 2 === 0 ? 'bg-slate-900/20' : 'bg-transparent'
                )}
              >
                <td className="min-w-0 px-4 py-2.5">
                  <p className="truncate text-sm font-semibold text-slate-100" title={row.name}>
                    {row.name}
                  </p>
                  <p className="truncate text-[10px] text-slate-500">{row.category}</p>
                </td>
                <td className="max-w-[9rem] px-4 py-2.5">
                  <span className="block truncate text-slate-400" title={row.supplier}>
                    {row.supplier}
                  </span>
                </td>
                <td className="max-w-[7rem] px-4 py-2.5">
                  <span
                    className="block truncate text-slate-300"
                    title={itemOriginLabel(row)}
                  >
                    {itemOriginLabel(row)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-300">
                  {row.onHandCases > 0 ? `${formatUnits(row.onHandCases)} cases` : '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-200">
                  {row.onHand > 0 ? (
                    <>
                      {formatUnits(row.onHand)} {unit}
                    </>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                  <OnHandBadges row={row} />
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-300">
                  {displayCaseCost(row)}
                </td>
                <td className={cn('px-4 py-2.5 text-right text-xs', shelf.cell)}>
                  {row.daysRemaining}d
                  {shelf.sub}
                </td>
              </tr>
            );
          })
        : null}
    </>
  );
}
