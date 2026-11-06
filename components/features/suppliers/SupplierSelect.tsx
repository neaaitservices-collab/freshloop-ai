'use client';

import React from 'react';
import type { SupplierRecord } from '@/lib/domains/suppliers/suppliers';
import { cn } from '@/lib/utils/cn';

const SELECT =
  'mt-2 w-full min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100';

export function SupplierSelect({
  suppliers,
  value,
  onChange,
  disabled,
  label = 'Supplier / vendor',
  className,
}: {
  suppliers: SupplierRecord[];
  value: string;
  onChange: (supplierId: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <select
        value={value}
        disabled={disabled || suppliers.length === 0}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT}
      >
        <option value="">Select a supplier…</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
