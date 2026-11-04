'use client';

import React, { useCallback, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useRole } from '@/components/auth/RoleProvider';
import { readApiError } from '@/lib/api/readApiError';
import {
  DEFAULT_HOURLY,
  formatHourlyRate,
  hourlyRateInputString,
  parseHourlyRateInput,
} from '@/lib/utils/hourlyRateDisplay';
import { positionForStaff, STAFF_POSITIONS } from '@/lib/utils/positions';
import { ScrollTable } from '@/components/ui/layout';
import {
  canManageStaff,
  canRemoveStaff,
} from '@/lib/auth/staffCapabilities';
import { ROLE_LABELS, type StaffUser } from '@/lib/utils/roles';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import {
  StaffEmployeeModal,
  type StaffEmployeeFormValues,
} from '@/components/features/admin/StaffEmployeeModal';

const EMPTY_FORM: StaffEmployeeFormValues = {
  name: '',
  email: '',
  position: STAFF_POSITIONS[3].label,
  hourlyRate: hourlyRateInputString(DEFAULT_HOURLY),
};

export function UserManagementTable({ embedded = false }: { embedded?: boolean }) {
  const { users, activeUser, loading, refresh } = useRole();
  const canManage = Boolean(activeUser && canManageStaff(activeUser.role));
  const canRemove = Boolean(activeUser && canRemoveStaff(activeUser.role));
  const canManageWage = canManage;

  const [modalMode, setModalMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffEmployeeFormValues>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const closeModal = useCallback(() => {
    setModalMode('closed');
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }, []);

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setModalMode('add');
  };

  const openEdit = (user: StaffUser) => {
    setEditingId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      position: positionForStaff(user.position, user.role).label,
      hourlyRate: hourlyRateInputString(user.hourlyRate),
    });
    setError(null);
    setModalMode('edit');
  };

  const save = async () => {
    let hourlyRate: number | undefined;
    if (canManageWage) {
      const parsed = parseHourlyRateInput(form.hourlyRate);
      if (parsed == null) {
        setError('Enter a valid hourly wage greater than zero.');
        return;
      }
      hourlyRate = parsed;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email.trim(),
        position: form.position,
      };
      if (canManageWage && hourlyRate != null) {
        payload.hourlyRate = hourlyRate;
      }
      const response = await fetch(editingId ? `/api/users/${editingId}` : '/api/users', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(readApiError(json, 'Could not save that employee.'));
        return;
      }
      closeModal();
      setSaveSuccess(editingId ? 'Employee updated.' : 'Employee added.');
      await refresh();
    } catch {
      setError('Could not save that employee. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (user: StaffUser, e: React.MouseEvent) => {
    e.stopPropagation();
    if (
      !window.confirm(
        `Remove ${user.name} from staff? They will lose access immediately.`
      )
    ) {
      return;
    }
    setError(null);
    try {
      const response = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(readApiError(json, 'Could not remove that employee.'));
        return;
      }
      if (editingId === user.id) closeModal();
      await refresh();
    } catch {
      setError('Could not remove that employee.');
    }
  };

  if (!canManage) {
    return null;
  }

  return (
    <section className={embedded ? '' : 'mt-10'}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-black tracking-tight text-white sm:text-xl">
            Staff Members
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Team roster and platform permissions by position.
          </p>
        </div>
        <Button
          type="button"
          variant="success"
          className="min-h-11 shrink-0 border-emerald-500/45 bg-emerald-500 px-4 font-black text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
          onClick={openAdd}
        >
          <Plus className="h-4 w-4" />
          Add New Employee
        </Button>
      </div>

      {saveSuccess && modalMode === 'closed' ? (
        <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-xs font-semibold text-emerald-100">
          {saveSuccess}
        </p>
      ) : null}
      {error && modalMode === 'closed' ? (
        <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-100">
          {error}
        </p>
      ) : null}

      {loading && users.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Loading staff…</p>
      ) : null}

      <div className="mt-4 min-w-0 overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-950/40">
        <ScrollTable>
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800/90 bg-slate-900/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2.5 sm:px-4">Name</th>
              <th className="hidden px-3 py-2.5 md:table-cell md:px-4">Position</th>
              <th className="hidden px-3 py-2.5 sm:table-cell sm:px-4">Wage</th>
              <th className="px-3 py-2.5 sm:px-4">Permissions</th>
              <th className="w-24 px-3 py-2.5 text-right sm:px-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {users.map((user) => (
              <tr
                key={user.id}
                className={cn(
                  'group cursor-pointer transition-colors hover:bg-slate-800/40',
                  user.id === activeUser?.id && 'bg-emerald-500/5'
                )}
                onClick={() => openEdit(user)}
              >
                <td className="px-3 py-2.5 sm:px-4">
                  <p className="font-bold leading-snug text-white">{user.name}</p>
                  <p className="text-[11px] text-slate-500">{user.email}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400 sm:hidden">
                    {user.position}
                  </p>
                </td>
                <td className="hidden px-3 py-2.5 text-slate-300 md:table-cell md:px-4">
                  {user.position}
                </td>
                <td className="hidden px-3 py-2.5 sm:table-cell sm:px-4">
                  <span className="font-mono text-xs font-semibold tabular-nums text-slate-200">
                    {formatHourlyRate(user.hourlyRate)}
                  </span>
                </td>
                <td className="px-3 py-2.5 sm:px-4">
                  <p className="text-xs font-bold text-emerald-300">
                    {ROLE_LABELS[user.role]}
                  </p>
                  <p className="font-mono text-[10px] text-slate-500 sm:hidden">
                    {formatHourlyRate(user.hourlyRate)}
                  </p>
                </td>
                <td className="px-3 py-2.5 sm:px-4">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      aria-label={`Edit ${user.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(user);
                      }}
                      className="rounded-lg border border-slate-700/80 bg-slate-900/80 p-2 text-emerald-300 transition hover:border-emerald-500/40 hover:bg-emerald-950/40"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {canRemove ? (
                      <button
                        type="button"
                        aria-label={`Remove ${user.name}`}
                        onClick={(e) => void remove(user, e)}
                        className="rounded-lg border border-transparent p-2 text-slate-500 opacity-0 transition group-hover:opacity-100 hover:border-rose-500/30 hover:bg-rose-950/40 hover:text-rose-300 focus:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                  No staff listed yet. Add your first employee above.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </ScrollTable>
      </div>

      <StaffEmployeeModal
        open={modalMode !== 'closed'}
        mode={modalMode === 'add' ? 'add' : 'edit'}
        values={form}
        saving={saving}
        error={error}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        onClose={closeModal}
        onSubmit={() => void save()}
        showHourlyRate={canManageWage}
      />
    </section>
  );
}
