'use client';

import React from 'react';
import { RETAIL_UNITS, type RetailUnit } from '@/lib/domains/receiving/yieldPricing';

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
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-900/60 text-[10px] font-black text-blue-100 ring-1 ring-blue-800">
            {step}
          </span>
          <h2 className="text-xs font-black uppercase tracking-wide text-slate-100">{title}</h2>
        </div>
        {hint ? <p className="text-[11px] text-slate-500">{hint}</p> : null}
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
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-black text-slate-100">{value}</p>
    </div>
  );
}

const UNIT_SELECT_CLASS =
  'w-full min-w-[5.5rem] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-bold text-slate-100 outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20';

export function UnitSelect({
  id,
  label,
  value,
  onChange,
  'aria-label': ariaLabel,
}: {
  id: string;
  label: string;
  value: RetailUnit;
  onChange: (value: RetailUnit) => void;
  'aria-label'?: string;
}) {
  return (
    <label htmlFor={id} className="block space-y-1.5">
      {label ? (
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      ) : null}
      <select
        id={id}
        aria-label={ariaLabel ?? label}
        value={value}
        onChange={(event) => onChange(event.target.value as RetailUnit)}
        className={UNIT_SELECT_CLASS}
      >
        {RETAIL_UNITS.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </select>
    </label>
  );
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  step = '0.01',
  min = '0',
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  step?: string;
  min?: string;
  className?: string;
}) {
  return (
    <label htmlFor={id} className={className ?? 'block space-y-1.5'}>
      {label ? (
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      ) : null}
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 font-mono text-sm font-bold text-slate-200 outline-none transition focus:border-slate-500 focus:ring-1 focus:ring-slate-600"
      />
    </label>
  );
}

export function CurrencyField({
  id,
  label,
  value,
  onChange,
  readOnly = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <div
        className={`flex overflow-hidden rounded-xl border border-slate-700 bg-slate-950 ${
          readOnly ? 'opacity-95' : 'focus-within:border-slate-500 focus-within:ring-1 focus-within:ring-slate-600'
        }`}
      >
        <span className="flex items-center bg-slate-900/80 px-3 font-mono text-sm font-black text-slate-300">
          $
        </span>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => {
            if (readOnly) return;
            const parsed = Number(value);
            if (Number.isFinite(parsed) && parsed >= 0) onChange(parsed.toFixed(2));
          }}
          className={`w-full bg-transparent px-3 py-2.5 font-mono text-sm font-bold outline-none ${
            readOnly ? 'cursor-default text-emerald-200/95' : 'text-slate-100'
          }`}
        />
      </div>
    </label>
  );
}
