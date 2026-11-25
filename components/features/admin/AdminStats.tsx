'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CONTROL_LOST_GOAL_PCT,
  WasteSemaphoreCard,
  lostSharePct,
} from '@/components/features/admin/WasteSemaphoreCard';
import { DashboardCard } from '@/components/features/admin/DashboardCard';
import { subscribeInventoryUpdated } from '@/lib/domains/inventory/inventoryMoveClient';
import { subscribeKpiUpdated } from '@/lib/domains/stats/kpiEvents';
import { adminPeriodRequest } from '@/lib/domains/stats/adminDateRange';
import {
  applyPeriodLoad,
  createPeriodLoader,
  figuresForSelectedPreset,
  periodRequestId,
  type PeriodRangeRequest,
  type TaggedPeriodFigures,
} from '@/lib/domains/stats/adminPeriodClient';
import { ADMIN_DATE_PRESETS } from '@/lib/domains/stats/storeTime';
import { FRESHLOOP_SETTINGS_UPDATED } from '@/lib/domains/stats/settingsEvents';
import type { StoreStats } from '@/lib/domains/stats/storeStatsTypes';
import type { WasteKpiReport } from '@/lib/domains/inventory/ledger';
import { officialWastePctLabel } from '@/lib/domains/stats/wasteKpi';
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
  wastePct = null,
  wastePctPending = false,
}: {
  rescued: number | null;
  lost: number | null;
  /** Live on-hand dollars. Not the date-range rescued or sales figure. */
  inventoryValue: number | null;
  scrapDollars: number | null;
  scrapBuckets: number | null;
  sales: number | null;
  periodPending: boolean;
  /** Ledger waste $ ÷ recognized sale revenue. Null when sales are below the floor. */
  wastePct?: number | null;
  wastePctPending?: boolean;
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
      <Row
        label="Waste"
        detail="Ledger waste ÷ sales"
        value={wastePctPending ? <Pulse /> : officialWastePctLabel(wastePct)}
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

function AdminStatsLive({
  stats,
  wasteKpi = null,
  inventoryValue = null,
}: {
  stats: StoreStats | null;
  /** Ledger waste % for the selected range. Sales under the floor stay null. */
  wasteKpi?: WasteKpiReport | null;
  /** Live on-hand total. Wins over `stats.inventoryValue` so the range cannot replace it. */
  inventoryValue?: number | null;
}) {
  const params = useSearchParams();
  const presetParam = params.get('preset');
  const fromParam = params.get('from');
  const toParam = params.get('to');
  const request = useMemo(
    () => adminPeriodRequest({ preset: presetParam, from: fromParam, to: toParam }),
    [presetParam, fromParam, toParam]
  );
  const preset = periodRequestId(request);
  const loaderRef = useRef<ReturnType<typeof createPeriodLoader> | null>(null);
  if (!loaderRef.current) loaderRef.current = createPeriodLoader();
  const loader = loaderRef.current;
  const [figures, setFigures] = useState<TaggedPeriodFigures | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(request);
  const selectedRef = useRef(preset);
  const figuresRef = useRef(figures);
  requestRef.current = request;
  selectedRef.current = preset;
  figuresRef.current = figures;
  const onHand = inventoryValue ?? stats?.inventoryValue ?? null;
  const visibleFigures = figuresForSelectedPreset(preset, figures);
  const showingSameChip = refreshing && visibleFigures != null;

  const loadPreset = useCallback(
    async (next: PeriodRangeRequest) => {
      const id = periodRequestId(next);
      const cached = loader.peek(next);
      if (cached) {
        const applied = applyPeriodLoad(id, figuresRef.current, {
          ok: true,
          preset: id,
          figures: cached,
        });
        setFigures(applied.figures);
        setRefreshing(false);
        setError(null);
        return;
      }
      setRefreshing(true);
      setError(null);
      const result = await loader.load(next);
      if (selectedRef.current !== id) return;
      const applied = applyPeriodLoad(id, figuresRef.current, result);
      if (applied.ignored) return;
      setFigures(applied.figures);
      setError(applied.error);
      setRefreshing(false);
    },
    [loader]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadPreset(request);
      if (cancelled) return;
      await Promise.all(
        ADMIN_DATE_PRESETS.filter((item) => item !== preset).map((item) => loader.prefetch(item))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [preset, request, loadPreset, loader]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        loader.invalidate();
        void loadPreset(requestRef.current);
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
    <DashboardCard className="p-4" aria-label="Stats" aria-busy={showingSameChip || undefined}>
      <header className="flex items-start justify-between gap-3 pb-1">
        <div>
          <h2 className="pt-1 text-base font-black text-slate-50">Stats</h2>
          {showingSameChip ? (
            <p className="text-xs font-semibold text-slate-500" role="status">
              Updating
            </p>
          ) : null}
        </div>
      </header>
      {error ? (
        <p
          role="alert"
          className="mb-2 rounded-xl border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-sm font-semibold text-rose-100"
        >
          {error}
        </p>
      ) : null}
      <div className={cn(showingSameChip && 'opacity-80')}>
        <StatsScorecardRows
          periodPending={visibleFigures == null}
          rescued={visibleFigures?.rescuedValue ?? null}
          lost={visibleFigures?.lostValue ?? null}
          inventoryValue={onHand}
          scrapDollars={visibleFigures?.scrapDollars ?? null}
          scrapBuckets={visibleFigures?.scrapBuckets ?? null}
          sales={visibleFigures?.sales ?? null}
          wastePct={wasteKpi?.wastePct ?? stats?.wastePct ?? null}
          wastePctPending={wasteKpi == null && stats == null}
        />
      </div>
    </DashboardCard>
  );
}

export function AdminStatsCard(props: {
  stats: StoreStats | null;
  wasteKpi?: WasteKpiReport | null;
  inventoryValue?: number | null;
}) {
  return (
    <Suspense
      fallback={
        <DashboardCard className="p-4" aria-label="Stats" aria-busy="true">
          <h2 className="pt-1 text-base font-black text-slate-50">Stats</h2>
        </DashboardCard>
      }
    >
      <AdminStatsLive {...props} />
    </Suspense>
  );
}
