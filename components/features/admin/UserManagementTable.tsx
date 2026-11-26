'use client';

import React, { useCallback, useId, useState } from 'react';
import { Plus } from 'lucide-react';
import { useRole } from '@/components/auth/RoleProvider';
import { readApiError } from '@/lib/api/readApiError';
import {
  DEFAULT_HOURLY,
  hourlyRateInputString,
  parseHourlyRateInput,
} from '@/lib/utils/hourlyRateDisplay';
import { departmentLabel, houseForRole, positionForRole, positionForStaff, STAFF_POSITIONS } from '@/lib/utils/positions';
import { canManageStaff, canRemoveStaff } from '@/lib/auth/staffCapabilities';
import { cn } from '@/lib/utils/cn';
import { type StaffUser } from '@/lib/utils/roles';
import { Button } from '@/components/ui/Button';
import { ModalBody, ModalFooter, ModalHeader, ModalShell } from '@/components/ui/layout';
import {
  StaffEmployeeModal,
  type StaffEmployeeFormValues,
} from '@/components/features/admin/StaffEmployeeModal';
import { StaffRosterCards, StaffRosterSkeleton } from '@/components/features/admin/StaffRosterCards';
import { StaffRosterErrorBoundary } from '@/components/features/admin/StaffRosterErrorBoundary';

const EMPTY_FORM: StaffEmployeeFormValues = {
  name: '',
  email: '',
  position: STAFF_POSITIONS[3].label,
  role: 'FLOOR_STAFF',
  hourlyRate: hourlyRateInputString(DEFAULT_HOURLY),
  currentPassword: '',
};

function StaffRoster({ embedded = false }: { embedded?: boolean }) {
  const { users, activeUser, loading, refresh, rosterError } = useRole();
  const canManage = Boolean(activeUser && canManageStaff(activeUser.role));
  const canRemove = Boolean(activeUser && canRemoveStaff(activeUser.role));
  const canAssignRole = canRemove;
  const canManageWage = canManage;

  const [modalMode, setModalMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffEmployeeFormValues>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [inactiveIncluded, setInactiveIncluded] = useState<StaffUser[] | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState<StaffUser | null>(null);
  const confirmTitleId = useId();

  const closeModal = useCallback(() => {
    setModalMode('closed');
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }, []);

  const loadInactive = useCallback(async () => {
    setListLoading(true);
    try {
      const response = await fetch('/api/users?includeInactive=1', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok || !json.success || !Array.isArray(json.users)) {
        setError(readApiError(json, 'Could not load inactive staff.'));
        return;
      }
      setInactiveIncluded(json.users as StaffUser[]);
    } catch {
      setError('Could not load inactive staff.');
    } finally {
      setListLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    await refresh();
    if (showInactive) await loadInactive();
  }, [refresh, showInactive, loadInactive]);

  const toggleInactive = () => {
    const next = !showInactive;
    setShowInactive(next);
    setError(null);
    if (next) void loadInactive();
  };

  const roster = showInactive && inactiveIncluded ? inactiveIncluded : users;
  const visible = roster.filter((user) => showInactive || !user.deactivatedAt);
  const activeOwnerCount = roster.filter((user) => user.role === 'ADMIN' && !user.deactivatedAt).length;
  const editing = roster.find((user) => user.id === editingId) ?? null;

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
      role: user.role,
      hourlyRate: hourlyRateInputString(user.hourlyRate),
      currentPassword: '',
    });
    setError(null);
    setModalMode('edit');
  };

  const changeForm = (patch: Partial<StaffEmployeeFormValues>) => {
    setForm((current) => {
      const next = { ...current, ...patch };
      if (patch.role && patch.role !== current.role) {
        next.position = positionForRole(patch.role).label;
      }
      return next;
    });
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
      if ((modalMode === 'add' || canAssignRole) && form.role) {
        payload.role = form.role;
      }
      if (canManageWage && hourlyRate != null) {
        payload.hourlyRate = hourlyRate;
      }
      if (form.currentPassword.trim()) {
        payload.currentPassword = form.currentPassword;
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
      const setupUrl = typeof json.setupUrl === 'string' ? json.setupUrl : '';
      setSaveSuccess(
        setupUrl
          ? `Employee added. Send this one-time setup link: ${setupUrl}`
          : editingId
            ? 'Employee updated.'
            : 'Employee added.'
      );
      await reload();
    } catch {
      setError('Could not save that employee. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!pendingDeactivate) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/users/${pendingDeactivate.id}`, { method: 'DELETE' });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(readApiError(json, 'Could not deactivate that employee.'));
        return;
      }
      setPendingDeactivate(null);
      if (editingId === pendingDeactivate.id) closeModal();
      setSaveSuccess(`${pendingDeactivate.name} is deactivated. Their inventory history stays.`);
      await reload();
    } catch {
      setError('Could not deactivate that employee.');
    } finally {
      setSaving(false);
    }
  };

  const reactivate = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/users/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reactivate: true }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(readApiError(json, 'Could not reactivate that employee.'));
        return;
      }
      closeModal();
      setSaveSuccess(`${editing.name} can sign in again.`);
      await reload();
    } catch {
      setError('Could not reactivate that employee.');
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return null;
  }

  const isSelf = Boolean(editing && activeUser && editing.id === activeUser.id);
  const isInactive = Boolean(editing?.deactivatedAt);
  const lastOwner = Boolean(
    editing && editing.role === 'ADMIN' && !editing.deactivatedAt && activeOwnerCount <= 1
  );
  const selfOwner = Boolean(isSelf && editing?.role === 'ADMIN');
  const roleLocked = modalMode === 'edit' && (selfOwner || lastOwner || !canAssignRole);
  const roleLockReason =
    modalMode !== 'edit'
      ? null
      : !canAssignRole
        ? 'Only an owner can change a role.'
        : selfOwner
          ? 'You cannot remove your own owner role.'
          : lastOwner
            ? 'Keep at least one owner.'
            : null;

  const showSkeleton =
    (loading && users.length === 0 && !rosterError) ||
    (showInactive && listLoading && !inactiveIncluded);

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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            aria-pressed={showInactive}
            onClick={toggleInactive}
            className={cn(
              'inline-flex min-h-11 items-center justify-center rounded-xl border px-4 text-sm font-bold',
              showInactive
                ? 'border-emerald-500/50 text-emerald-200'
                : 'border-slate-700 text-slate-200 hover:border-slate-500'
            )}
          >
            Show inactive
          </button>
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
      </div>

      {saveSuccess && modalMode === 'closed' ? (
        <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-xs font-semibold text-emerald-100">
          {saveSuccess}
        </p>
      ) : null}
      {error && modalMode === 'closed' && !pendingDeactivate ? (
        <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-100">
          {error}
        </p>
      ) : null}

      {rosterError ? (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-100"
        >
          {rosterError}
        </p>
      ) : null}

      {showSkeleton ? <StaffRosterSkeleton /> : null}

      {!showSkeleton && !(visible.length === 0 && rosterError) ? (
        <StaffRosterCards
          users={visible}
          activeUserId={activeUser?.id}
          onOpen={openEdit}
        />
      ) : null}

      <StaffEmployeeModal
        open={modalMode !== 'closed'}
        mode={modalMode === 'add' ? 'add' : 'edit'}
        values={form}
        house={houseForRole(form.role)}
        department={departmentLabel(form.position, form.role)}
        saving={saving}
        error={modalMode === 'closed' ? null : error}
        onChange={changeForm}
        onClose={closeModal}
        onSubmit={() => void save()}
        showHourlyRate={canManageWage}
        askCurrentPassword={modalMode === 'edit' && editingId === activeUser?.id}
        roleEditable={modalMode === 'add' || (canAssignRole && !roleLocked)}
        roleLockReason={roleLockReason}
        showDeactivate={modalMode === 'edit' && canRemove && !isSelf && !lastOwner && !isInactive}
        showReactivate={modalMode === 'edit' && canRemove && isInactive}
        deactivateNote={
          modalMode === 'edit' && canRemove && isSelf
            ? 'You cannot deactivate your own account.'
            : modalMode === 'edit' && canRemove && lastOwner
              ? 'Keep at least one owner.'
              : null
        }
        onDeactivate={() => editing && setPendingDeactivate(editing)}
        onReactivate={() => void reactivate()}
      />

      <ModalShell
        open={pendingDeactivate !== null}
        onClose={() => {
          if (!saving) setPendingDeactivate(null);
        }}
        width="sm"
        zIndexClass="z-[70]"
        labelledBy={confirmTitleId}
      >
        <ModalHeader>
          <h2 id={confirmTitleId} className="text-lg font-black text-white">
            Deactivate {pendingDeactivate?.name}?
          </h2>
        </ModalHeader>
        <ModalBody>
          <p className="text-sm text-slate-300">
            They lose access immediately and disappear from the active roster. Inventory history
            stays attributed to them. You can reactivate them later.
          </p>
          {error ? (
            <p className="mt-3 rounded-xl border border-rose-900/50 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-200">
              {error}
            </p>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={saving}
              onClick={() => setPendingDeactivate(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              className="w-full sm:w-auto"
              disabled={saving}
              onClick={() => void deactivate()}
            >
              {saving ? 'Deactivating…' : 'Deactivate employee'}
            </Button>
          </div>
        </ModalFooter>
      </ModalShell>
    </section>
  );
}

export function UserManagementTable({ embedded = false }: { embedded?: boolean }) {
  const { refresh } = useRole();
  return (
    <StaffRosterErrorBoundary onRetry={() => refresh()}>
      <StaffRoster embedded={embedded} />
    </StaffRosterErrorBoundary>
  );
}
