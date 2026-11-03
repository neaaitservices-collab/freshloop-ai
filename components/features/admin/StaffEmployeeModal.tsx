'use client';

import React, { useEffect, useId } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { positionByLabel, STAFF_POSITIONS } from '@/lib/utils/positions';
import { ROLE_LABELS } from '@/lib/utils/roles';
import { cn } from '@/lib/utils/cn';

export type StaffEmployeeFormValues = {
  name: string;
  email: string;
  position: string;
  /** Dollar amount per hour as typed in the modal (parsed on save). */
  hourlyRate: string;
};

type StaffEmployeeModalProps = {
  open: boolean;
  mode: 'add' | 'edit';
  values: StaffEmployeeFormValues;
  saving: boolean;
  error: string | null;
  onChange: (patch: Partial<StaffEmployeeFormValues>) => void;
  onClose: () => void;
  onSubmit: () => void;
  showHourlyRate?: boolean;
};

export function StaffEmployeeModal({
  open,
  mode,
  values,
  saving,
  error,
  onChange,
  onClose,
  onSubmit,
  showHourlyRate = true,
}: StaffEmployeeModalProps) {
  const titleId = useId();
  const selected = positionByLabel(values.position) ?? STAFF_POSITIONS[3];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-slate-800/90 px-4 py-4 sm:px-5">
          <div>
            <h2 id={titleId} className="text-lg font-black text-white">
              {mode === 'add' ? 'Add New Employee' : 'Edit Employee Details'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Position sets permissions. Hourly wage drives BOM labor costing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          className="space-y-4 overflow-y-auto px-4 py-4 sm:px-5"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <label className="block text-xs font-bold text-slate-400">
            Name
            <Input
              required
              value={values.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className="mt-1.5 min-h-11"
              autoComplete="name"
            />
          </label>
          <label className="block text-xs font-bold text-slate-400">
            Email
            <Input
              required
              type="email"
              value={values.email}
              onChange={(e) => onChange({ email: e.target.value })}
              className="mt-1.5 min-h-11"
              autoComplete="email"
            />
          </label>
          <label className="block text-xs font-bold text-slate-400">
            Position
            <Select
              required
              value={values.position}
              onChange={(e) => onChange({ position: e.target.value })}
              className="mt-1.5 min-h-11"
            >
              {STAFF_POSITIONS.map((position) => (
                <option key={position.label} value={position.label}>
                  {position.label} · {ROLE_LABELS[position.role]}
                </option>
              ))}
            </Select>
            <span className="mt-1.5 block font-medium normal-case tracking-normal text-slate-500">
              {selected.access}
            </span>
          </label>
          {showHourlyRate ? (
            <label className="block text-xs font-bold text-slate-400">
              Hourly wage ($/hr)
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
                  $
                </span>
                <Input
                  required
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  max={10000}
                  step={0.01}
                  value={values.hourlyRate}
                  onChange={(e) => onChange({ hourlyRate: e.target.value })}
                  className="min-h-11 pl-7 font-mono tabular-nums"
                  placeholder="17.60"
                  aria-describedby="hourly-rate-hint"
                />
              </div>
              <span
                id="hourly-rate-hint"
                className="mt-1.5 block font-medium normal-case text-slate-500"
              >
                Used when this employee runs production batches.
              </span>
            </label>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-rose-900/50 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-200">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 border-t border-slate-800/80 pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 w-full sm:w-auto"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="success"
              className={cn(
                'min-h-11 w-full border-emerald-500/40 bg-emerald-500 font-black text-slate-950 hover:bg-emerald-400 sm:w-auto'
              )}
              disabled={saving}
            >
              {saving
                ? 'Saving…'
                : mode === 'add'
                  ? 'Create Employee'
                  : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
