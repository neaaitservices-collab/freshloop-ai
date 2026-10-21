'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { PageIntro } from '@/components/shell/PageIntro';
import { UserManagementTable } from '@/components/UserManagementTable';
import { useRole } from '@/components/auth/RoleProvider';
import { isManager, ROLE_LABELS } from '@/lib/roles';
import type { PlatformSettings } from '@/lib/platformSettings';

const FIELD =
  'mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-white';

function ProfileForm() {
  const { activeUser, loading, refresh } = useRole();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeUser) return;
    setName(activeUser.name);
    setEmail(activeUser.email);
    setPosition(activeUser.position);
    setMessage(null);
    setError(null);
  }, [activeUser]);

  const save = async () => {
    if (!activeUser) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/users/${activeUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          position,
          role: activeUser.role,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(json.error || 'Could not save your details.');
        return;
      }
      await refresh();
      setMessage('Personal details saved.');
    } catch {
      setError('Could not save your details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="mt-5 grid gap-3 rounded-3xl border border-zinc-800 bg-zinc-900/80 p-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="sm:col-span-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Personal information</p>
        <p className="mt-1 text-sm text-zinc-400">
          {loading && !activeUser
            ? 'Loading your profile…'
            : activeUser
              ? ROLE_LABELS[activeUser.role]
              : 'No profile is selected.'}
        </p>
      </div>
      <label className="text-xs font-bold text-zinc-400">
        Name
        <input required value={name} onChange={(event) => setName(event.target.value)} className={FIELD} />
      </label>
      <label className="text-xs font-bold text-zinc-400">
        Email
        <input
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={FIELD}
        />
      </label>
      <label className="text-xs font-bold text-zinc-400 sm:col-span-2">
        Position
        <input
          required
          value={position}
          onChange={(event) => setPosition(event.target.value)}
          className={FIELD}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={saving || !activeUser}
          className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-zinc-950 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
        {message ? <p className="text-sm font-bold text-emerald-300">{message}</p> : null}
        {error ? <p className="text-sm text-amber-200">{error}</p> : null}
      </div>
    </form>
  );
}

function SettingsForm({ settings }: { settings: PlatformSettings | null }) {
  const [draft, setDraft] = useState<PlatformSettings | null>(settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  const update = (patch: Partial<PlatformSettings>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setMessage(null);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(json.error || 'Settings could not be saved.');
        return;
      }
      setDraft(json.settings as PlatformSettings);
      setMessage('Store settings saved.');
    } catch {
      setError('Settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="mt-10"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">Settings</p>
      <h2 className="mt-1 text-2xl font-black tracking-tight text-white">Store</h2>
      <p className="mt-1 max-w-2xl text-sm text-zinc-400">
        Waste target, pull window, scrap buckets, and the invoice cost alert.
      </p>
      {!draft ? (
        <p className="mt-4 text-sm text-zinc-400">Reading store settings…</p>
      ) : (
        <div className="mt-4 grid gap-3 rounded-3xl border border-zinc-800 bg-zinc-900/80 p-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-zinc-400 sm:col-span-2">
            Store name
            <input
              required
              value={draft.storeName}
              onChange={(event) => update({ storeName: event.target.value })}
              className={FIELD}
            />
          </label>
          <label className="text-xs font-bold text-zinc-400">
            Waste target (%)
            <input
              required
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={draft.targetWastePct}
              onChange={(event) => update({ targetWastePct: Number(event.target.value) })}
              className={FIELD}
            />
          </label>
          <label className="text-xs font-bold text-zinc-400">
            Pull window
            <select
              value={draft.pullSensitivityDays}
              onChange={(event) => update({ pullSensitivityDays: Number(event.target.value) })}
              className={FIELD}
            >
              <option value={2}>2 days</option>
              <option value={3}>3 days</option>
              <option value={4}>4 days</option>
            </select>
          </label>
          <label className="text-xs font-bold text-zinc-400">
            Scrap bucket (L)
            <input
              required
              type="number"
              min="0.1"
              step="0.1"
              value={draft.scrapBucketVolumeL}
              onChange={(event) => update({ scrapBucketVolumeL: Number(event.target.value) })}
              className={FIELD}
            />
          </label>
          <label className="text-xs font-bold text-zinc-400">
            Trim density (kg/L)
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={draft.estimatedWeightPerLiterKg}
              onChange={(event) => update({ estimatedWeightPerLiterKg: Number(event.target.value) })}
              className={FIELD}
            />
          </label>
          <label className="text-xs font-bold text-zinc-400">
            Scrap cost ($/kg)
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={draft.defaultScrapCostPerKg}
              onChange={(event) => update({ defaultScrapCostPerKg: Number(event.target.value) })}
              className={FIELD}
            />
          </label>
          <label className="text-xs font-bold text-zinc-400">
            Invoice cost alert (%)
            <input
              required
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={draft.costGuardrailVariancePct}
              onChange={(event) => update({ costGuardrailVariancePct: Number(event.target.value) })}
              className={FIELD}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-zinc-950 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save settings'}
            </button>
            {message ? <p className="text-sm font-bold text-emerald-300">{message}</p> : null}
            {error ? <p className="text-sm text-amber-200">{error}</p> : null}
          </div>
        </div>
      )}
    </form>
  );
}

export function AccountPage({
  settings,
  figures,
  children,
}: {
  settings: PlatformSettings | null;
  figures?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { activeUser, loading } = useRole();
  const manager = activeUser ? isManager(activeUser.role) : false;
  const title = !activeUser && loading ? 'Account' : manager ? 'Admin' : 'Profile';

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-7xl px-3 py-5 pb-28 sm:px-6 sm:py-8">
        <PageIntro
          step={title}
          title={title}
          description={
            manager
              ? 'Your details, then the store statistics, controls, and settings.'
              : 'Your name, email, and position.'
          }
        />
        <ProfileForm />
        {manager ? (
          <>
            <section className="mt-10">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">Statistics</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-white">Overview</h2>
              <p className="mt-1 max-w-2xl text-sm text-zinc-400">
                The same figures as Today: rescued value, waste, low stock, and the department alerts.
              </p>
              {figures}
            </section>
            <SettingsForm settings={settings} />
            <UserManagementTable />
            {children}
          </>
        ) : null}
      </main>
    </AppShell>
  );
}
