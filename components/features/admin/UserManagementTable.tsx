'use client';

import React, { useState } from 'react';
import { Pencil, Trash2, UserPlus } from 'lucide-react';
import { useRole } from '@/components/auth/RoleProvider';
import { positionByLabel, positionForStaff, STAFF_POSITIONS } from '@/lib/utils/positions';
import { ROLE_LABELS, type StaffUser } from '@/lib/utils/roles';

const EMPTY_FORM = {
  name: '',
  email: '',
  position: 'Produce floor',
};

export function UserManagementTable({ embedded = false }: { embedded?: boolean }) {
  const { users, activeUser, loading, refresh } = useRole();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startEdit = (user: StaffUser) => {
    setEditingId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      position: positionForStaff(user.position, user.role).label,
    });
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(editingId ? `/api/users/${editingId}` : '/api/users', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(json.error || 'Could not save that person.');
        return;
      }
      cancelEdit();
      await refresh();
    } catch {
      setError('Could not save that person.');
    } finally {
      setSaving(false);
    }
  };

  const selected = positionByLabel(form.position) ?? STAFF_POSITIONS[3];

  const remove = async (user: StaffUser) => {
    setError(null);
    try {
      const response = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(json.error || 'Could not remove that person.');
        return;
      }
      if (editingId === user.id) cancelEdit();
      await refresh();
    } catch {
      setError('Could not remove that person.');
    }
  };

  return (
    <section className="mt-10">
      {embedded ? null : (
        <>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">Controls</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-white">Staff</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Add the people who work the store. The position you choose is the access they get on the platform.
          </p>
        </>
      )}

      {loading && users.length === 0 ? <p className="mt-4 text-sm text-zinc-400">Loading staff…</p> : null}

        <form
          className="mt-4 grid gap-3 rounded-3xl border border-zinc-800 bg-zinc-900/80 p-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="text-xs font-bold text-zinc-400">
            Name
            <input
              required
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-white"
            />
          </label>
          <label className="text-xs font-bold text-zinc-400">
            Email
            <input
              required
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-white"
            />
          </label>
          <label className="text-xs font-bold text-zinc-400 sm:col-span-2">
            Position
            <select
              required
              value={form.position}
              onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-white"
            >
              {STAFF_POSITIONS.map((position) => (
                <option key={position.label} value={position.label}>
                  {position.label} · {ROLE_LABELS[position.role]}
                </option>
              ))}
            </select>
            <span className="mt-1 block font-medium normal-case tracking-normal text-zinc-500">
              {selected.access}
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-zinc-950 disabled:opacity-60"
            >
              <UserPlus className="h-4 w-4" />
              {editingId ? 'Save changes' : 'Add person'}
            </button>
            {editingId ? (
              <button type="button" onClick={cancelEdit} className="px-3 py-3 text-sm font-bold text-zinc-400">
                Cancel
              </button>
            ) : null}
            {error ? <p className="text-sm text-amber-200">{error}</p> : null}
          </div>
        </form>

        <div className="mt-4 overflow-x-auto rounded-3xl border border-zinc-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-zinc-900 text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Permissions</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 bg-zinc-950">
              {users.map((user) => (
                <tr key={user.id} className={user.id === activeUser?.id ? 'bg-emerald-400/5' : undefined}>
                  <td className="px-4 py-3">
                    <p className="font-bold text-white">{user.name}</p>
                    <p className="text-xs text-zinc-500">{user.email}</p>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{user.position}</td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-emerald-300">{ROLE_LABELS[user.role]}</p>
                    <p className="max-w-xs text-xs text-zinc-500">
                      {positionForStaff(user.position, user.role).access}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        aria-label={`Edit ${user.name}`}
                        onClick={() => startEdit(user)}
                        className="rounded-lg border border-zinc-700 p-2 text-zinc-200"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${user.name}`}
                        onClick={() => void remove(user)}
                        className="rounded-lg border border-zinc-700 p-2 text-zinc-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </section>
  );
}
