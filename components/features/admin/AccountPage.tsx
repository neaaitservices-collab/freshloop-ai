'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChefHat, Package, Store } from 'lucide-react';
import { PageIntro } from '@/components/layout/PageIntro';
import { UserManagementTable } from '@/components/features/admin/UserManagementTable';
import { useRole } from '@/components/auth/RoleProvider';
import { positionForStaff } from '@/lib/utils/positions';
import { isManager } from '@/lib/utils/roles';
import type { PlatformSettings } from '@/lib/domains/stats/platformSettings';

const FIELD =
  'mt-1 w-full min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-100';

function ProfileForm() {
  const { activeUser, loading, refresh } = useRole();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeUser) return;
    setName(activeUser.name);
    setEmail(activeUser.email);
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
      className="grid gap-3 rounded-3xl border border-zinc-800 bg-zinc-900/80 p-4 sm:grid-cols-2"
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
              ? positionForStaff(activeUser.position, activeUser.role).access
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
      <div className="text-xs font-bold text-zinc-400 sm:col-span-2">
        Position
        <p className="mt-1 text-sm font-bold text-white">{activeUser?.position || '—'}</p>
        <p className="mt-1 font-medium text-zinc-500">
          A manager sets this in Staff. That choice is the access on the platform.
        </p>
      </div>
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

export function SettingsForm({ settings }: { settings: PlatformSettings | null }) {
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
            Kitchen labor rate ($/hr)
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={draft.defaultLaborRatePerHour}
              onChange={(event) =>
                update({ defaultLaborRatePerHour: Number(event.target.value) })
              }
              className={FIELD}
            />
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

const STEPS = [
  {
    href: '/receive',
    step: '1',
    title: 'Receive',
    text: 'Read the delivery, turn each case into retail units, and set the floor price.',
    icon: Package,
  },
  {
    href: '/inventory',
    step: '2',
    title: 'Inventory & floor',
    text: 'See everything on hand, pull short-dated stock, and send it to the kitchen before it becomes waste.',
    icon: Store,
  },
  {
    href: '/kitchen',
    step: '3',
    title: 'Kitchen',
    text: 'Cook rescued product into a prepared item and log scrap buckets.',
    icon: ChefHat,
  },
];

function DaySteps() {
  return (
    <nav
      className="mt-4 flex flex-col gap-2 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-3 sm:flex-row sm:flex-wrap sm:items-center"
      aria-label="Daily workflow"
    >
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:mr-1">
        Today
      </span>
      {STEPS.map((step) => {
        const Icon = step.icon;
        return (
          <Link
            key={step.href}
            href={step.href}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs font-bold text-slate-200 transition hover:border-blue-800/60 hover:bg-slate-800/50"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-900/40 text-[10px] font-black text-blue-200">
              {step.step}
            </span>
            <Icon className="h-3.5 w-3.5 text-blue-300/90" />
            {step.title}
            <ArrowRight className="h-3 w-3 text-slate-500" />
          </Link>
        );
      })}
      <Link
        href="/operations"
        className="text-xs font-bold text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline sm:ml-auto"
      >
        Full ledger
      </Link>
    </nav>
  );
}

export function AccountPage({
  settings,
  figures,
  children,
}: {
  settings: React.ReactNode;
  figures?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { activeUser, loading } = useRole();
  const manager = Boolean(activeUser && isManager(activeUser.role));
  // Wait for Auth.js session before showing manager-only dashboard controls.
  const showControls = !loading && manager;
  const title = loading ? 'Account' : manager ? 'Admin' : 'Profile';

  return (
      <main className="mx-auto w-full max-w-7xl px-3 py-5 pb-28 sm:px-6 sm:py-8">
        <PageIntro
          step={showControls ? 'Store dashboard' : 'Account'}
          title={title}
          description={
            showControls
              ? 'Ledger KPIs and recovery charts at a glance. Profile, settings, and case board below.'
              : 'Your name, email, and position.'
          }
        />
        {showControls ? (
          <>
            <div className="mt-4">{figures}</div>
            <DaySteps />
          </>
        ) : null}
        <div className={showControls ? 'mt-10' : 'mt-5'}>
          <ProfileForm />
        </div>
        {showControls ? (
          <>
            {settings}
            <UserManagementTable />
            {children}
          </>
        ) : null}
      </main>
  );
}
