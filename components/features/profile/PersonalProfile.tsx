'use client';

import React, { useEffect, useState } from 'react';
import { useRole } from '@/components/auth/RoleProvider';
import { PageIntro } from '@/components/layout/PageIntro';
import { PageMain } from '@/components/ui/layout';
import { positionForStaff } from '@/lib/utils/positions';

const FIELD =
  'mt-1 w-full min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-100';

export function ProfileForm() {
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

/** Signed-in staff see and edit only the account on the current session. */
export function PersonalProfile() {
  return (
    <PageMain className="py-4 pb-24 sm:py-6">
      <PageIntro step="Account" title="Profile" description="Your name, email, and position." />
      <div className="mt-5">
        <ProfileForm />
      </div>
    </PageMain>
  );
}
