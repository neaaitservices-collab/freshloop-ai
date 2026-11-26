'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  normalizePullSensitivityDays,
  type PullSensitivityDays,
} from '@/lib/domains/inventory/pullSensitivity';
import {
  FRESHLOOP_SETTINGS_UPDATED,
  readSettingsUpdatedEvent,
} from '@/lib/domains/stats/settingsEvents';

export type StorePullSensitivityDays = PullSensitivityDays;

function seededPullDays(value: unknown): StorePullSensitivityDays | null {
  if (value === 2 || value === 3 || value === 4) return value;
  return null;
}

/**
 * Store-wide pull window from platform settings.
 * Starts at the server value when one was passed. Otherwise stays null until
 * the saved row loads — never a hardcoded 3.
 */
export function useStorePullSensitivityDays(initial?: number | null): {
  pullDays: StorePullSensitivityDays | null;
  ready: boolean;
} {
  const [pullDays, setPullDays] = useState<StorePullSensitivityDays | null>(() =>
    seededPullDays(initial)
  );
  const [ready, setReady] = useState(() => seededPullDays(initial) != null);

  const syncFromApi = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/settings', { cache: 'no-store' });
      const json = await response.json();
      if (response.ok && json?.success && json.settings) {
        setPullDays(normalizePullSensitivityDays(json.settings.pullSensitivityDays));
        setReady(true);
        return;
      }
    } catch {
      /* keep the value already on screen */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    void syncFromApi();
    const onSettings = (event: Event) => {
      const settings = readSettingsUpdatedEvent(event);
      if (settings?.pullSensitivityDays != null) {
        setPullDays(normalizePullSensitivityDays(settings.pullSensitivityDays));
        setReady(true);
        return;
      }
      void syncFromApi();
    };
    window.addEventListener(FRESHLOOP_SETTINGS_UPDATED, onSettings);
    return () => window.removeEventListener(FRESHLOOP_SETTINGS_UPDATED, onSettings);
  }, [syncFromApi]);

  return { pullDays, ready };
}
