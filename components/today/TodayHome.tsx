'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, ChefHat, Package, Store } from 'lucide-react';
import { AppShell } from '@/components/shell/AppShell';
import { AdminStats } from '@/components/admin/AdminStats';

interface TodaySnapshot {
  wastePct: number | null;
  targetWastePct: number;
  pulls: number;
  status: 'ok' | 'high' | 'unknown';
  lowCount: number | null;
}

const STEPS = [
  {
    href: '/receive',
    step: '1',
    title: 'Receive',
    text: 'Read the delivery, turn each case into retail units, and set the floor price.',
    icon: Package,
  },
  {
    href: '/floor',
    step: '2',
    title: 'Floor',
    text: 'Pull anything within 2–4 days and send it to the kitchen before it becomes waste.',
    icon: Store,
  },
  {
    href: '/kitchen',
    step: '3',
    title: 'Kitchen',
    text: 'Cook rescued product into a prepared item and log scrap buckets.',
    icon: ChefHat,
  },
];

export function TodayHome() {
  const [snapshot, setSnapshot] = useState<TodaySnapshot>({
    wastePct: null,
    targetWastePct: 2.5,
    pulls: 0,
    status: 'unknown',
    lowCount: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/inventory?pullDays=3&scrapBuckets=0', { cache: 'no-store' });
        const json = await response.json();
        const waste = json.liveLedger?.wasteKpi;
        const rows = Array.isArray(json.liveLedger?.subInventoryRows)
          ? json.liveLedger.subInventoryRows
          : [];
        const items = Array.isArray(json.items) ? json.items : [];
        const pullsFromLedger = rows.filter(
          (row: { retailFloorQty?: number; daysRemaining?: number }) =>
            (row.retailFloorQty ?? 0) > 0 && (row.daysRemaining ?? 99) <= 3
        ).length;
        const pullsFromItems = items.filter(
          (item: { quantity?: number; daysRemaining?: number }) =>
            (item.quantity ?? 0) > 0 && (item.daysRemaining ?? 99) <= 3
        ).length;
        const pulls = pullsFromLedger || pullsFromItems;
        if (cancelled) return;
        const wastePct = typeof waste?.wastePct === 'number' ? waste.wastePct : null;
        const target = typeof waste?.targetWastePct === 'number' ? waste.targetWastePct : 2.5;
        setSnapshot((current) => ({
          ...current,
          wastePct,
          targetWastePct: target,
          pulls,
          status: wastePct === null ? 'unknown' : wastePct > target ? 'high' : 'ok',
        }));
      } catch {
        if (!cancelled) setSnapshot((current) => ({ ...current, status: 'unknown' }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/inventory/levels', { cache: 'no-store' });
        const json = await response.json();
        if (cancelled || typeof json.lowCount !== 'number') return;
        setSnapshot((current) => ({ ...current, lowCount: json.lowCount }));
      } catch {
        if (!cancelled) setSnapshot((current) => ({ ...current, lowCount: null }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const wasteLabel =
    snapshot.wastePct === null ? '—' : `${snapshot.wastePct.toFixed(2)}%`;
  const healthy = snapshot.status !== 'high';

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-7xl px-3 py-5 pb-28 sm:px-6 sm:py-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">Store dashboard</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Today</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
          The numbers come from the ledger. The three steps below are the work for the floor.
        </p>

        <AdminStats />

        <section
          className={`mt-5 rounded-3xl border p-5 ${
            healthy ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-rose-500/40 bg-rose-500/10'
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">Waste right now</p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <p className={`font-mono text-4xl font-black ${healthy ? 'text-emerald-300' : 'text-rose-300'}`}>
              {wasteLabel}
            </p>
            <p className="text-sm text-zinc-300">
              Target {snapshot.targetWastePct.toFixed(1)}%
              <span className="mt-1 block text-zinc-400">
                {snapshot.pulls} to pull within 3 days
              </span>
            </p>
          </div>
        </section>

        <Link
          href="/orders"
          className="mt-3 flex items-center justify-between gap-3 rounded-3xl border border-amber-500/30 bg-zinc-900 px-5 py-4 transition hover:-translate-y-0.5 hover:border-amber-300/60"
        >
          <span>
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5" />
              Low stock
            </span>
            <span className="mt-1 block text-sm text-zinc-300">
              {snapshot.lowCount === null
                ? 'Checking on-hand cases…'
                : snapshot.lowCount === 0
                  ? 'Nothing is below its alert level.'
                  : `${snapshot.lowCount} items are below their alert level. Print the supplier order.`}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-black text-amber-200">
            Orders
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>

        <ol className="mt-5 grid gap-3 md:grid-cols-3">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <li key={step.href}>
                <Link
                  href={step.href}
                  className="flex h-full flex-col rounded-3xl border border-zinc-800 bg-zinc-900 p-4 transition hover:-translate-y-0.5 hover:border-emerald-400/50"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400 text-sm font-black text-zinc-950">
                    {step.step}
                  </span>
                  <span className="mt-3 flex items-center gap-2 text-lg font-black text-white">
                    <Icon className="h-5 w-5 text-emerald-300" />
                    {step.title}
                  </span>
                  <span className="mt-1 flex-1 text-sm leading-relaxed text-zinc-400">{step.text}</span>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-black text-emerald-300">
                    Open
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>

        <Link
          href="/operations"
          className="mt-5 inline-flex text-sm font-bold text-zinc-400 underline-offset-4 hover:text-white hover:underline"
        >
          Open the full ledger
        </Link>
      </main>
    </AppShell>
  );
}
