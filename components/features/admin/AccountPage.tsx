'use client';

import React, { useEffect, useState } from 'react';
import { PageIntro } from '@/components/layout/PageIntro';
import { AdminViewTabs } from '@/components/features/admin/AdminViewTabs';
import { UserManagementTable } from '@/components/features/admin/UserManagementTable';
import { ProfileForm } from '@/components/features/profile/PersonalProfile';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { PageMain } from '@/components/ui/layout';
import { useRole } from '@/components/auth/RoleProvider';
import { isManager } from '@/lib/utils/roles';
import type { PlatformSettings } from '@/lib/domains/stats/platformSettings';
import { dispatchSettingsUpdated } from '@/lib/domains/stats/settingsEvents';

const FIELD =
  'mt-1 w-full min-h-12 rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-100';

export function SettingsForm({
  settings,
  layout = 'embedded',
}: {
  settings: PlatformSettings | null;
  layout?: 'embedded' | 'page';
}) {
  const [draft, setDraft] = useState<PlatformSettings | null>(settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  useEffect(() => {
    if (layout !== 'page' || !draft) return;
    const hash = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, [layout, draft]);

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
      dispatchSettingsUpdated(json.settings as PlatformSettings);
    } catch {
      setError('Settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      id="store-settings"
      className={layout === 'page' ? 'mt-6 scroll-mt-24' : 'mt-10 scroll-mt-24'}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {layout === 'embedded' ? (
        <>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">Settings</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-white">Store</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Targets and defaults for the waste traffic light, floor pulls, production scrap, and receiving.
          </p>
        </>
      ) : null}
      {!draft ? (
        <p className="mt-4 text-sm text-zinc-400">Reading store settings…</p>
      ) : (
        <div className="mt-4 space-y-4">
          <fieldset className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
            <legend className="px-1 text-xs font-black uppercase tracking-wider text-zinc-500">
              Store identity
            </legend>
            <label className="mt-2 block text-xs font-bold text-zinc-400">
              Store name
              <input
                required
                value={draft.storeName}
                onChange={(event) => update({ storeName: event.target.value })}
                className={FIELD}
              />
            </label>
          </fieldset>

          <fieldset
            id="waste-pulls"
            className="scroll-mt-24 rounded-2xl border border-emerald-900/40 bg-emerald-950/10 p-4"
          >
            <legend className="px-1 text-xs font-black uppercase tracking-wider text-emerald-400/90">
              Waste &amp; floor pulls
            </legend>
            <p className="mt-1 text-[11px] text-zinc-500">
              Default pull window for SKUs without their own setting (set per item in Admin
              catalog). Drives stats and floor alerts when an item uses store default.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-zinc-400">
                Waste goal (%)
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
                Default pull window
                <select
                  value={draft.pullSensitivityDays}
                  onChange={(event) => update({ pullSensitivityDays: Number(event.target.value) })}
                  className={FIELD}
                >
                  <option value={2}>2 days (strict)</option>
                  <option value={3}>3 days (standard)</option>
                  <option value={4}>4 days (extended)</option>
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset
            id="kitchen-scrap"
            className="scroll-mt-24 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4"
          >
            <legend className="px-1 text-xs font-black uppercase tracking-wider text-zinc-500">
              Production scrap &amp; labor
            </legend>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
              Volumetric scrap buckets (Operations) convert to $ with{' '}
              <span className="font-mono text-zinc-400">volume (L) × trim density (kg/L) × $/kg</span>.
              That $ feeds the Admin waste traffic light alongside direct discards.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-zinc-400">
                Production labor ($/hr)
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
                <span className="mt-1 block text-[11px] font-normal text-zinc-500">
                  Standard tub size for one volumetric scrap log.
                </span>
              </label>
              <label className="text-xs font-bold text-zinc-400">
                Trim density (kg/L)
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={draft.estimatedWeightPerLiterKg}
                  onChange={(event) =>
                    update({ estimatedWeightPerLiterKg: Number(event.target.value) })
                  }
                  className={FIELD}
                />
                <span className="mt-1 block text-[11px] font-normal text-zinc-500">
                  kg of prep trim per liter in the tub (weight estimate from volume).
                </span>
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
                <span className="mt-1 block text-[11px] font-normal text-zinc-500">
                  $ per kg applied after density converts liters to kg.
                </span>
              </label>
            </div>
          </fieldset>

          <fieldset className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
            <legend className="px-1 text-xs font-black uppercase tracking-wider text-zinc-500">
              Receiving
            </legend>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold text-zinc-400">
                Invoice cost alert (%)
                <input
                  required
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={draft.costGuardrailVariancePct}
                  onChange={(event) =>
                    update({ costGuardrailVariancePct: Number(event.target.value) })
                  }
                  className={FIELD}
                />
              </label>
              <label className="block text-xs font-bold text-zinc-400">
                Price change alert (%)
                <input
                  required
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={draft.priceChangeThresholdPct}
                  onChange={(event) =>
                    update({ priceChangeThresholdPct: Number(event.target.value) })
                  }
                  className={FIELD}
                />
                <span className="mt-1 block text-[11px] font-normal text-zinc-500">
                  Used when a confirmed invoice unit cost moves by at least this percent.
                </span>
              </label>
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
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
      <PageMain className="py-4 pb-24 sm:py-6">
        {showControls ? (
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <AdminViewTabs />
          </div>
        ) : (
          <PageIntro
            step="Account"
            title={title}
            description="Your name, email, and position."
          />
        )}
        {showControls ? (
          <>
            <div className="space-y-6">{figures}</div>
            <div className="mt-6 space-y-3">
              {settings}
              <CollapsibleSection
                title="Personal profile"
                description="Name and email"
                defaultOpen={false}
              >
                <ProfileForm />
              </CollapsibleSection>
              <CollapsibleSection
                title="Staff"
                description="Team roster and permissions"
                defaultOpen={false}
              >
                <UserManagementTable embedded />
              </CollapsibleSection>
              {children ? (
                <CollapsibleSection
                  anchorId="inventory-catalog"
                  title="Inventory catalog"
                  description="Stock & margin control — full SKU list from the database"
                  defaultOpen={false}
                >
                  {children}
                </CollapsibleSection>
              ) : null}
            </div>
          </>
        ) : (
          <div className="mt-5">
            <ProfileForm />
          </div>
        )}
      </PageMain>
  );
}
