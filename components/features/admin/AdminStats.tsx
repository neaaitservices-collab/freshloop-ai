'use client';

import type { ReactNode } from 'react';
import {
  CONTROL_LOST_GOAL_PCT,
  WasteSemaphoreCard,
  lostSharePct,
} from '@/components/features/admin/WasteSemaphoreCard';
import { StatsDateFilter } from '@/components/features/admin/StatsDateFilter';
import { DashboardCard } from '@/components/features/admin/DashboardCard';
import type { StoreStats } from '@/lib/domains/stats/storeStatsTypes';
import type { WasteKpiReport } from '@/lib/domains/inventory/ledger';

export function formatScoreMoney(value: number, digits: 0 | 2): string {
  if (!Number.isFinite(value)) return digits === 0 ? '$0' : '$0.00';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function scrapBucketLabel(count: number): string {
  if (!Number.isFinite(count)) return '0 buckets';
  const rounded = Number(count.toFixed(1));
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${rounded === 1 ? 'bucket' : 'buckets'}`;
}

function Pulse() {
  return <span className="inline-block h-6 w-16 animate-pulse rounded bg-slate-800" aria-hidden />;
}

function Row({
  label,
  detail,
  value,
}: {
  label: string;
  detail?: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-slate-800 py-3.5">
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-slate-300">{label}</p>
        {detail ? <p className="pt-0.5 text-xs font-semibold text-slate-500">{detail}</p> : null}
      </div>
      <div className="shrink-0 text-right text-xl font-black tracking-tight text-slate-50">{value}</div>
    </div>
  );
}

export function StatsScorecardRows({
  rescued,
  lost,
  inventoryValue,
  scrapDollars,
  scrapBuckets,
  sales,
  periodPending,
}: {
  rescued: number | null;
  lost: number | null;
  /** Live on-hand dollars. Not the date-range rescued or sales figure. */
  inventoryValue: number | null;
  scrapDollars: number | null;
  scrapBuckets: number | null;
  sales: number | null;
  periodPending: boolean;
}) {
  const lostPct =
    !periodPending && rescued != null && lost != null ? lostSharePct(rescued, lost) : null;
  const lostText = periodPending ? null : lostPct == null ? '—' : `${lostPct.toFixed(1)}%`;

  return (
    <div>
      <WasteSemaphoreCard lostPct={lostPct} pending={periodPending} />
      <Row
        label="Inventory value"
        detail="On hand now"
        value={inventoryValue == null ? <Pulse /> : formatScoreMoney(inventoryValue, 2)}
      />
      <Row
        label="Scraps"
        value={
          periodPending || scrapDollars == null || scrapBuckets == null ? (
            <Pulse />
          ) : (
            <>
              <p>{formatScoreMoney(scrapDollars, 2)}</p>
              <p className="pt-0.5 text-[13px] font-bold text-slate-200">
                {scrapBucketLabel(scrapBuckets)}
              </p>
            </>
          )
        }
      />
      <Row
        label="Sales"
        detail="Subtracted from main inventory"
        value={periodPending || sales == null ? <Pulse /> : formatScoreMoney(sales, 2)}
      />
      <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pb-2 pt-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Rescued</p>
          <p className="pt-1 text-lg font-black tracking-tight text-emerald-400">
            {periodPending || rescued == null ? <Pulse /> : formatScoreMoney(rescued, 0)}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Lost</p>
          <p className="pt-1 text-lg font-black tracking-tight text-rose-400">
            {lostText == null ? <Pulse /> : lostText}
          </p>
          <p className="pt-0.5 text-xs font-semibold text-slate-500">Of rescued + discarded</p>
        </div>
      </div>
      <p className="sr-only">Lost goal is {CONTROL_LOST_GOAL_PCT}% of rescued plus discarded.</p>
    </div>
  );
}

export function AdminStatsCard({
  stats,
  wasteKpi,
  inventoryValue = null,
}: {
  stats: StoreStats | null;
  wasteKpi: WasteKpiReport | null;
  /** Live on-hand total. Wins over `stats.inventoryValue` so the chip cannot replace it. */
  inventoryValue?: number | null;
}) {
  const onHand = inventoryValue ?? stats?.inventoryValue ?? null;
  return (
    <DashboardCard className="p-4" aria-label="Stats">
      <header className="flex items-start justify-between gap-3 pb-1">
        <h2 className="pt-1 text-base font-black text-slate-50">Stats</h2>
        <StatsDateFilter variant="chips" defaultPreset="week" />
      </header>
      <StatsScorecardRows
        periodPending={stats == null}
        rescued={stats?.rescuedValue ?? null}
        lost={stats?.lostValue ?? null}
        inventoryValue={onHand}
        scrapDollars={wasteKpi?.volumetricScrapValue ?? null}
        scrapBuckets={wasteKpi?.volumetricScrapBucketsCount ?? null}
        sales={wasteKpi?.grossSalesRevenue ?? null}
      />
    </DashboardCard>
  );
}
