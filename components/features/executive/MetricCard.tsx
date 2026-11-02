'use client';

import React from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { cn } from '@/lib/utils/cn';

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  accent = 'text-slate-100',
  trend,
  loading = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
  trend?: { direction: 'up' | 'down' | 'flat'; text: string };
  loading?: boolean;
}) {
  return (
    <Card className="h-full transition hover:border-slate-700/80">
      <CardBody className="py-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
          <span className="rounded-lg bg-slate-950/80 p-1.5 ring-1 ring-slate-800">
            <Icon className="h-3.5 w-3.5 text-emerald-400/90" aria-hidden />
          </span>
        </div>
        {loading ? (
          <div className="mt-3 h-9 w-28 animate-pulse rounded-lg bg-slate-800" />
        ) : (
          <p className={cn('mt-2 font-mono text-2xl font-black tracking-tight sm:text-[1.75rem]', accent)}>
            {value}
          </p>
        )}
        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-500">{detail}</p>
        {trend && !loading ? (
          <p
            className={cn(
              'mt-2 text-[10px] font-bold uppercase tracking-wide',
              trend.direction === 'up' && 'text-emerald-400/90',
              trend.direction === 'down' && 'text-rose-400/90',
              trend.direction === 'flat' && 'text-slate-500'
            )}
          >
            {trend.text}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
