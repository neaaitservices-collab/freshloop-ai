'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Info, Sparkles } from 'lucide-react';
import type { ExecutiveInsight } from '@/lib/domains/executive/types';
import { formatCurrency } from '@/lib/domains/receiving/yieldPricing';
import { cn } from '@/lib/utils/cn';

const ICONS = {
  success: Sparkles,
  warning: AlertTriangle,
  info: Info,
} as const;

const STYLES = {
  success: 'border-emerald-900/40 bg-emerald-950/25',
  warning: 'border-amber-900/45 bg-amber-950/20',
  info: 'border-slate-700 bg-slate-900/60',
} as const;

export function ActionableInsightBanner({ insight }: { insight: ExecutiveInsight }) {
  const Icon = ICONS[insight.severity];
  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between',
        STYLES[insight.severity]
      )}
    >
      <div className="flex min-w-0 gap-3">
        <Icon
          className={cn(
            'mt-0.5 h-5 w-5 shrink-0',
            insight.severity === 'success' && 'text-emerald-400',
            insight.severity === 'warning' && 'text-amber-400',
            insight.severity === 'info' && 'text-slate-400'
          )}
          aria-hidden
        />
        <div className="min-w-0">
          <h3 className="text-sm font-black text-slate-100">{insight.title}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{insight.body}</p>
          {insight.savingsUsd != null && insight.savingsUsd > 0 ? (
            <p className="mt-1 text-[11px] font-bold text-emerald-300/90">
              Modeled upside: {formatCurrency(insight.savingsUsd)}/mo
            </p>
          ) : null}
        </div>
      </div>
      {insight.ctaHref && insight.ctaLabel ? (
        <Link
          href={insight.ctaHref}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-emerald-300 ring-1 ring-slate-700 transition hover:bg-slate-900"
        >
          {insight.ctaLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </article>
  );
}

export function ActionableInsightStack({ insights }: { insights: ExecutiveInsight[] }) {
  if (insights.length === 0) return null;
  return (
    <div className="space-y-2">
      {insights.map((insight) => (
        <ActionableInsightBanner key={insight.id} insight={insight} />
      ))}
    </div>
  );
}
