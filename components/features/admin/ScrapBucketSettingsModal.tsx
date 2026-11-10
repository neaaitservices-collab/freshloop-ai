'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { PlatformSettings } from '@/lib/domains/stats/platformSettings';
import { dispatchSettingsUpdated } from '@/lib/domains/stats/settingsEvents';
import Link from 'next/link';
import {
  scrapBucketInputsFromSettings,
  scrapDollarsPerBucket,
} from '@/lib/domains/stats/scrapBucketEconomics';
import { ScrapBucketFormulaSummary } from '@/components/features/admin/WasteFormulaBreakdown';
import { ModalBody, ModalFooter, ModalHeader, ModalShell } from '@/components/ui/layout';

const FIELD =
  'mt-1 w-full min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100';

export function ScrapBucketSettingsModal({
  open,
  onClose,
  bucketCount,
}: {
  open: boolean;
  onClose: () => void;
  bucketCount: number;
}) {
  const [draft, setDraft] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/settings', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success || !json.settings) {
        setError(json.error || 'Could not load settings.');
        return;
      }
      setDraft(json.settings as PlatformSettings);
    } catch {
      setError('Could not load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const scrapInputs = useMemo(
    () => (draft ? scrapBucketInputsFromSettings(draft) : null),
    [draft]
  );
  const costPerBucket = scrapInputs ? scrapDollarsPerBucket(scrapInputs) : 0;

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Could not save.');
        return;
      }
      setDraft(json.settings as PlatformSettings);
      setMessage('Scrap defaults saved.');
      dispatchSettingsUpdated(json.settings as PlatformSettings);
      window.dispatchEvent(new CustomEvent('freshloop-inventory-updated'));
    } catch {
      setError('Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell open={open} onClose={onClose} width="sm" zIndexClass="z-[100]">
      <ModalHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400/90">
              Production scrap
            </p>
            <h2 id="scrap-bucket-settings-title" className="text-lg font-black text-white">
              Bucket $ defaults
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              When production staff log a <strong className="font-medium text-slate-300">volumetric scrap</strong>{' '}
              bucket (not individual thrown-away SKUs), the ledger counts buckets and converts them to
              dollars for the Admin waste %:{' '}
              <span className="font-mono text-[11px] text-slate-500">
                L × kg/L × $/kg
              </span>
              . {bucketCount.toFixed(1)} bucket(s) are in the ledger today.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="pointer-events-auto relative z-30 min-h-11 min-w-11 rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </ModalHeader>

      <ModalBody>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </p>
        ) : draft ? (
          <form
            id="scrap-bucket-form"
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold text-slate-400">
                Bucket volume (L)
                <input
                  required
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={draft.scrapBucketVolumeL}
                  onChange={(e) =>
                    setDraft({ ...draft, scrapBucketVolumeL: Number(e.target.value) })
                  }
                  className={FIELD}
                />
                <span className="mt-1 block text-[11px] font-normal leading-snug text-slate-500">
                  Size of one production scrap tub (e.g. 20 L). Each volumetric scrap log in Operations
                  counts as one full bucket at this volume.
                </span>
              </label>
              <label className="block text-xs font-bold text-slate-400">
                Trim density (kg/L)
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={draft.estimatedWeightPerLiterKg}
                  onChange={(e) =>
                    setDraft({ ...draft, estimatedWeightPerLiterKg: Number(e.target.value) })
                  }
                  className={FIELD}
                />
                <span className="mt-1 block text-[11px] font-normal leading-snug text-slate-500">
                  Average weight of trim, peels, and prep waste per liter in the tub—turns volume into
                  kilograms (20 L × 0.65 kg/L ≈ 13 kg). Lower for light produce; higher for dense
                  trim.
                </span>
              </label>
              <label className="block text-xs font-bold text-slate-400 sm:col-span-2">
                Scrap cost ($/kg)
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.defaultScrapCostPerKg}
                  onChange={(e) =>
                    setDraft({ ...draft, defaultScrapCostPerKg: Number(e.target.value) })
                  }
                  className={FIELD}
                />
                <span className="mt-1 block text-[11px] font-normal leading-snug text-slate-500">
                  Dollar value per kg of that waste—usually average ingredient cost or a disposal fee.
                  Multiplied by estimated kg per bucket to get scrap $ on the waste KPI.
                </span>
              </label>
            </div>

            {scrapInputs ? (
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-400">
                <ScrapBucketFormulaSummary inputs={scrapInputs} bucketCount={bucketCount} />
                <p className="mt-2 text-center font-mono text-sm text-amber-200">
                  ≈ ${costPerBucket.toFixed(2)} per bucket logged
                </p>
              </div>
            ) : null}

          </form>
        ) : (
          <p className="text-sm text-amber-200">{error || 'Settings unavailable.'}</p>
        )}
      </ModalBody>

      {draft && !loading ? (
        <ModalFooter>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              form="scrap-bucket-form"
              disabled={saving}
              className="inline-flex min-h-11 items-center rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-60 sm:min-h-12"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <Link
              href="/admin/settings#kitchen-scrap"
              className="inline-flex min-h-11 items-center text-xs font-bold text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
              onClick={onClose}
            >
              All store settings
            </Link>
            {message ? <p className="text-sm font-bold text-emerald-300">{message}</p> : null}
            {error ? <p className="text-sm text-amber-200">{error}</p> : null}
          </div>
        </ModalFooter>
      ) : null}
    </ModalShell>
  );
}
