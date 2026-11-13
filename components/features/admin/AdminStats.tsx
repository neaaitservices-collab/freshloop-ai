'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CONTROL_LOST_GOAL_PCT,
  WasteSemaphoreCard,
  lostSharePct,
} from '@/components/features/admin/WasteSemaphoreCard';
import { StatsDateFilter } from '@/components/features/admin/StatsDateFilter';
import { DashboardCard } from '@/components/features/admin/DashboardCard';
import { subscribeInventoryUpdated } from '@/lib/domains/inventory/inventoryMoveClient';
import { subscribeKpiUpdated } from '@/lib/domains/stats/kpiEvents';
import {
  createPeriodLoader,
  PERIOD_PRESETS,
  type PeriodPreset,
} from '@/lib/domains/stats/adminPeriodClient';
import { FRESHLOOP_SETTINGS_UPDATED } from '@/lib/domains/stats/settingsEvents';
import type { AdminPeriodFigures, StoreStats } from '@/lib/domains/stats/storeStatsTypes';
import type { WasteKpiReport } from '@/lib/domains/inventory/ledger';
import { cn } from '@/lib/utils/cn';

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
  inventoryValue = null,
}: {
  stats: StoreStats | null;
  /** Kept for callers. Period scraps and sales come from the chip fetch, not this report. */
  wasteKpi?: WasteKpiReport | null;
  /** Live on-hand total. Wins over `stats.inventoryValue` so the chip cannot replace it. */
  inventoryValue?: number | null;
}) {
  const loaderRef = useRef<ReturnType<typeof createPeriodLoader> | null>(null);
  if (!loaderRef.current) loaderRef.current = createPeriodLoader();
  const loader = loaderRef.current;
  const [preset, setPreset] = useState<PeriodPreset>('week');
  const [figures, setFigures] = useState<AdminPeriodFigures | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const presetRef = useRef(preset);
  presetRef.current = preset;
  const onHand = inventoryValue ?? stats?.inventoryValue ?? null;
  const showingPrevious = refreshing && figures != null;

  const loadPreset = useCallback(
    async (next: PeriodPreset) => {
      const cached = loader.peek(next);
      if (cached) {
        setFigures(cached);
        setRefreshing(false);
        setError(null);
        return;
      }
      setRefreshing(true);
      setError(null);
      const result = await loader.load(next);
      if (presetRef.current !== next) return;
      if (!result.ok) {
        if (result.aborted) return;
        setError(result.error);
        setRefreshing(false);
        return;
      }
      setFigures(result.figures);
      setRefreshing(false);
    },
    [loader]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadPreset(preset);
      if (cancelled) return;
      await Promise.all(
        PERIOD_PRESETS.filter((item) => item !== preset).map((item) => loader.prefetch(item))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [preset, loadPreset, loader]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        loader.invalidate();
        void loadPreset(presetRef.current);
      }, 350);
    };
    const unsubInventory = subscribeInventoryUpdated((detail) => {
      if (detail?.skipStatsRefresh) return;
      schedule();
    });
    const unsubKpi = subscribeKpiUpdated(schedule);
    window.addEventListener(FRESHLOOP_SETTINGS_UPDATED, schedule);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubInventory();
      unsubKpi();
      window.removeEventListener(FRESHLOOP_SETTINGS_UPDATED, schedule);
      loader.abort();
    };
  }, [loadPreset, loader]);

  return (
    <DashboardCard className="p-4" aria-label="Stats" aria-busy={showingPrevious || undefined}>
      <header className="flex items-start justify-between gap-3 pb-1">
        <div>
          <h2 className="pt-1 text-base font-black text-slate-50">Stats</h2>
          {showingPrevious ? (
            <p className="text-xs font-semibold text-slate-500" role="status">
              Updating
            </p>
          ) : null}
        </div>
        <StatsDateFilter
          variant="chips"
          defaultPreset="week"
          preset={preset}
          onPresetChange={setPreset}
        />
      </header>
      {error ? <p className="pb-2 text-sm text-amber-200">{error}</p> : null}
      <div className={cn(showingPrevious && 'opacity-80')}>
        <StatsScorecardRows
          periodPending={figures == null}
          rescued={figures?.rescuedValue ?? null}
          lost={figures?.lostValue ?? null}
          inventoryValue={onHand}
          scrapDollars={figures?.scrapDollars ?? null}
          scrapBuckets={figures?.scrapBuckets ?? null}
          sales={figures?.sales ?? null}
        />
      </div>
    </DashboardCard>
  );
}
