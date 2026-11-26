'use client';

import React, { useId } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { ModalBody, ModalFooter, ModalHeader, ModalShell } from '@/components/ui/layout';
import { ROLE_LABELS, ROLES, type RoleName } from '@/lib/utils/roles';
import { cn } from '@/lib/utils/cn';

export type StaffEmployeeFormValues = {
  name: string;
  email: string;
  position: string;
  role: RoleName;
  /** Dollar amount per hour as typed in the modal (parsed on save). */
  hourlyRate: string;
  currentPassword: string;
};

type StaffEmployeeModalProps = {
  open: boolean;
  mode: 'add' | 'edit';
  values: StaffEmployeeFormValues;
  house: 'Front' | 'Back';
  department: string;
  saving: boolean;
  error: string | null;
  onChange: (patch: Partial<StaffEmployeeFormValues>) => void;
  onClose: () => void;
  onSubmit: () => void;
  showHourlyRate?: boolean;
  askCurrentPassword?: boolean;
  roleEditable?: boolean;
  roleLockReason?: string | null;
  showDeactivate?: boolean;
  showReactivate?: boolean;
  deactivateNote?: string | null;
  onDeactivate?: () => void;
  onReactivate?: () => void;
};

export function StaffEmployeeModal({
  open,
  mode,
  values,
  house,
  department,
  saving,
  error,
  onChange,
  onClose,
  onSubmit,
  showHourlyRate = true,
  askCurrentPassword = false,
  roleEditable = false,
  roleLockReason = null,
  showDeactivate = false,
  showReactivate = false,
  deactivateNote = null,
  onDeactivate,
  onReactivate,
}: StaffEmployeeModalProps) {
  const titleId = useId();

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
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-black text-white">
              {mode === 'add' ? 'Add New Employee' : 'Employee'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Role sets access. Department follows that role. Wage drives BOM labor costing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="pointer-events-auto relative z-30 min-h-11 min-w-11 shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-400">Back / front</p>
              <p className="mt-1.5 text-sm font-semibold text-white">{house}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-400">Department</p>
              <p className="mt-1.5 break-words text-sm font-semibold text-white">{department}</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400">Role</p>
            {roleEditable ? (
              <Select
                required
                aria-label="Role"
                value={values.role}
                onChange={(e) => onChange({ role: e.target.value as RoleName })}
                className="mt-1.5"
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="mt-1.5 text-sm font-semibold text-white">{ROLE_LABELS[values.role]}</p>
            )}
            {roleLockReason ? (
              <span className="mt-1.5 block font-medium normal-case tracking-normal text-slate-500">
                {roleLockReason}
              </span>
            ) : null}
          </div>
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
          <div className="flex flex-col gap-2">
            {showReactivate ? (
              <Button
                type="button"
                variant="success"
                className="w-full"
                onClick={onReactivate}
                disabled={saving}
              >
                Reactivate employee
              </Button>
            ) : null}
            {showDeactivate ? (
              <Button
                type="button"
                variant="danger"
                className="w-full"
                onClick={onDeactivate}
                disabled={saving}
              >
                Deactivate employee
              </Button>
            ) : null}
            {deactivateNote ? (
              <p className="text-xs font-medium text-slate-500">{deactivateNote}</p>
            ) : null}
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
          </div>
        </ModalFooter>
      </form>
    </ModalShell>
  );
}
