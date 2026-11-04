'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PlatformSettings } from '@/lib/domains/stats/platformSettings';
import {
  FRESHLOOP_SETTINGS_UPDATED,
  readSettingsUpdatedEvent,
} from '@/lib/domains/stats/settingsEvents';

const DEFAULT_CLIENT_SETTINGS: PlatformSettings = {
  storeName: 'FreshLoop Independent Market',
  targetWastePct: 2.5,
  scrapBucketVolumeL: 20,
  estimatedWeightPerLiterKg: 0.65,
  defaultScrapCostPerKg: 3.5,
  defaultLaborRatePerHour: 17.6,
  pullSensitivityDays: 3,
  costGuardrailVariancePct: 20,
};

let cachedSettings: PlatformSettings | null = null;
let inflightSettingsPromise: Promise<PlatformSettings | null> | null = null;

async function fetchStoreSettingsCoalesced(force = false): Promise<PlatformSettings | null> {
  if (!force && cachedSettings) {
    return cachedSettings;
  }
  if (!force && inflightSettingsPromise) {
    return inflightSettingsPromise;
  }
  inflightSettingsPromise = fetch('/api/admin/settings', { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) return cachedSettings;
      const json = (await res.json()) as {
        success?: boolean;
        settings?: PlatformSettings;
      };
      if (json?.success && json.settings) {
        cachedSettings = json.settings;
        return json.settings;
      }
      return cachedSettings;
    })
    .catch(() => cachedSettings)
    .finally(() => {
      inflightSettingsPromise = null;
    });

  return inflightSettingsPromise;
}

/**
 * Shared client hook for store settings that coalesces concurrent `/api/admin/settings`
 * requests and stays synchronized via `FRESHLOOP_SETTINGS_UPDATED`.
 */
export function useStoreSettings(initial?: PlatformSettings | null) {
  const [settings, setSettings] = useState<PlatformSettings>(() => {
    if (initial) {
      cachedSettings = initial;
      return initial;
    }
    return cachedSettings ?? DEFAULT_CLIENT_SETTINGS;
  });

  const refresh = useCallback(async (force = true) => {
    const next = await fetchStoreSettingsCoalesced(force);
    if (next) setSettings(next);
    return next;
  }, []);

  useEffect(() => {
    if (initial) {
      cachedSettings = initial;
      setSettings(initial);
      return;
    }
    let mounted = true;
    void fetchStoreSettingsCoalesced(false).then((loaded) => {
      if (mounted && loaded) setSettings(loaded);
    });
    return () => {
      mounted = false;
    };
  }, [initial]);

  useEffect(() => {
    const onSettingsUpdated = (event: Event) => {
      const saved = readSettingsUpdatedEvent(event);
      if (saved) {
        cachedSettings = saved;
        setSettings(saved);
        return;
      }
      void refresh(true);
    };
    window.addEventListener(FRESHLOOP_SETTINGS_UPDATED, onSettingsUpdated);
    return () => window.removeEventListener(FRESHLOOP_SETTINGS_UPDATED, onSettingsUpdated);
  }, [refresh]);

  return { settings, refresh };
}
