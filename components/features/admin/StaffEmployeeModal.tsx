'use client';

import React, { useEffect, useId } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { ModalBody, ModalFooter, ModalHeader, ModalShell } from '@/components/ui/layout';
import { positionByLabel, STAFF_POSITIONS } from '@/lib/utils/positions';
import { ROLE_LABELS } from '@/lib/utils/roles';
import { cn } from '@/lib/utils/cn';

export type StaffEmployeeFormValues = {
  name: string;
  email: string;
  position: string;
  /** Dollar amount per hour as typed in the modal (parsed on save). */
  hourlyRate: string;
  currentPassword: string;
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
  askCurrentPassword?: boolean;
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
  askCurrentPassword = false,
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

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      width="sm"
      zIndexClass="z-[60]"
      labelledBy={titleId}
    >
      <ModalHeader>
        <div className="flex items-start justify-between gap-3">
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
            className="min-h-11 min-w-11 rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </ModalHeader>

      <form
        id="staff-employee-form"
        className="contents"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <ModalBody className="space-y-4">
          <label className="block text-xs font-bold text-slate-400">
            Name
            <Input
              required
              value={values.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className="mt-1.5"
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
              className="mt-1.5"
              autoComplete="email"
            />
          </label>
          <label className="block text-xs font-bold text-slate-400">
            Position
            <Select
              required
              value={values.position}
              onChange={(e) => onChange({ position: e.target.value })}
              className="mt-1.5"
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
                  className="pl-7 font-mono tabular-nums"
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

          {askCurrentPassword ? (
            <label className="block text-xs font-bold text-slate-400">
              Current password
              <Input
                type="password"
                value={values.currentPassword}
                onChange={(e) => onChange({ currentPassword: e.target.value })}
                className="mt-1.5"
                autoComplete="current-password"
              />
              <span className="mt-1.5 block font-medium normal-case text-slate-500">
                Required when you change your own email. Other sessions sign in again.
              </span>
            </label>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-rose-900/50 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-200">
              {error}
            </p>
          ) : null}
        </ModalBody>

        <ModalFooter>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="success"
              className={cn(
                'w-full border-emerald-500/40 bg-emerald-500 font-black text-slate-950 hover:bg-emerald-400 sm:w-auto'
              )}
              disabled={saving}
            >
              {saving ? 'Saving…' : mode === 'add' ? 'Create Employee' : 'Save Changes'}
            </Button>
          </div>
        </ModalFooter>
      </form>
    </ModalShell>
  );
}
