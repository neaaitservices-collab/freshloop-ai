'use client';

import React from 'react';

export function ChartTooltip({
  active,
  payload,
  label,
  money = false,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
    payload?: { units?: number; percentOfTotal?: number };
  }>;
  label?: string;
  money?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum, item) => sum + (Number(item.value) || 0), 0);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-md">
      {label ? <p className="mb-1 font-bold text-white">{label}</p> : null}
      {payload.map((item) => {
        const value = Number(item.value) || 0;
        const share = item.payload?.percentOfTotal ?? (total > 0 ? (value / total) * 100 : 0);
        return (
          <p key={item.name} className="font-semibold" style={{ color: item.color ?? '#e4e4e7' }}>
            {item.name}: {money ? `$${value.toFixed(2)}` : value}{' '}
            <span className="text-zinc-400">({share.toFixed(1)}%)</span>
          </p>
        );
      })}
    </div>
  );
}
