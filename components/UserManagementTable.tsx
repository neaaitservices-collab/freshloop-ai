'use client';

import React, { useState } from 'react';
import { Pencil, Trash2, UserPlus } from 'lucide-react';
import { AppShell } from '@/components/shell/AppShell';
import { PageIntro } from '@/components/shell/PageIntro';
import { useRole } from '@/components/auth/RoleProvider';
import { ROLE_LABELS, ROLES, type RoleName, type StaffUser } from '@/lib/roles';

const EMPTY_FORM = {
  name: '',
  email: '',
  position: '',
  role: 'FLOOR_STAFF' as RoleName,
};

export function UserManagementTable() {
  const { users, activeUser, loading, setActiveUserId, refresh } = useRole();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startEdit = (user: StaffUser) => {
    setEditingId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      position: user.position,
      role: user.role,
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
    <AppShell>
      <main className="mx-auto w-full max-w-5xl px-3 py-5 pb-28 sm:px-6 sm:py-8">
        <PageIntro
          step="Admin"
          title="Staff"
          description="Add the people who work the store and give each one a job. Acting as someone limits what the next phases will show."
        />

        <section className="mt-5 rounded-3xl border border-zinc-800 bg-zinc-900/80 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Acting as</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              aria-label="Acting as"
              value={activeUser?.id ?? ''}
              onChange={(event) => setActiveUserId(event.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm font-bold text-white sm:max-w-sm"
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} · {ROLE_LABELS[user.role]}
                </option>
              ))}
            </select>
            <p className="text-sm text-zinc-400">
              {activeUser
                ? `${activeUser.position} · ${activeUser.email}`
                : loading
                  ? 'Loading staff…'
                  : 'No staff yet.'}
            </p>
          </div>
        </section>

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
          <label className="text-xs font-bold text-zinc-400">
            Position
            <input
              required
              value={form.position}
              onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))}
              className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-white"
            />
          </label>
          <label className="text-xs font-bold text-zinc-400">
            Role
            <select
              value={form.role}
              onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as RoleName }))}
              className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-white"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
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
                <th className="px-4 py-3">Role</th>
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
                  <td className="px-4 py-3 font-bold text-emerald-300">{ROLE_LABELS[user.role]}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveUserId(user.id)}
                        className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-200"
                      >
                        Act as
                      </button>
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
      </main>
    </AppShell>
  );
}
