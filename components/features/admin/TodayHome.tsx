'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, ChefHat, Package, Store } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';

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

export function TodayHome({ figures }: { figures: React.ReactNode }) {
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-7xl px-3 py-5 pb-28 sm:px-6 sm:py-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">Store dashboard</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Today</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
          The numbers come from the ledger. The three steps below are the work for the floor.
        </p>

        {figures}

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
