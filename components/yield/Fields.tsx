'use client';

import React from 'react';

export function SectionCard({
  step,
  title,
  hint,
  children,
}: {
  step: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-[10px] font-black text-zinc-950">
            {step}
          </span>
          <h2 className="text-xs font-black uppercase tracking-wide text-white">{title}</h2>
        </div>
        {hint ? <p className="text-[11px] text-zinc-500">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function ReadOnlyStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-black text-white">{value}</p>
    </div>
  );
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  step = '0.01',
  min = '0',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  step?: string;
  min?: string;
}) {
  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{label}</span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 font-mono text-sm font-bold text-white outline-none transition focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-500/20"
      />
    </label>
  );
}

export function CurrencyField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{label}</span>
      <div className="flex overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 focus-within:border-emerald-400/70 focus-within:ring-2 focus-within:ring-emerald-500/20">
        <span className="flex items-center bg-zinc-900 px-3 font-mono text-sm font-black text-emerald-300">
          $
        </span>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => {
            const parsed = Number(value);
            if (Number.isFinite(parsed) && parsed >= 0) onChange(parsed.toFixed(2));
          }}
          className="w-full bg-transparent px-3 py-2.5 font-mono text-sm font-bold text-white outline-none"
        />
      </div>
    </label>
  );
}
