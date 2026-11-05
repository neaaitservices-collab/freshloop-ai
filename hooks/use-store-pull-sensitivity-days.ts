'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  FRESHLOOP_SETTINGS_UPDATED,
  readSettingsUpdatedEvent,
} from '@/lib/domains/stats/settingsEvents';

export type StorePullSensitivityDays = 2 | 3 | 4;

function normalizePullDays(value: unknown): StorePullSensitivityDays {
  if (value === 2 || value === 3 || value === 4) return value;
  return 3;
}

/** Store-wide pull window from platform settings (read-only for floor/operations UI). */
export function useStorePullSensitivityDays() {
  const [pullDays, setPullDays] = useState<StorePullSensitivityDays>(3);

  const syncFromApi = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/settings', { cache: 'no-store' });
      const json = await response.json();
      if (json?.success && json.settings) {
        setPullDays(normalizePullDays(json.settings.pullSensitivityDays));
      }
    } catch {
      /* keep current */
    }
  }, []);

  useEffect(() => {
    void syncFromApi();
    const onSettings = (event: Event) => {
      const settings = readSettingsUpdatedEvent(event);
      if (settings?.pullSensitivityDays != null) {
        setPullDays(normalizePullDays(settings.pullSensitivityDays));
        return;
      }
      void syncFromApi();
    };
    window.addEventListener(FRESHLOOP_SETTINGS_UPDATED, onSettings);
    return () => window.removeEventListener(FRESHLOOP_SETTINGS_UPDATED, onSettings);
  }, [syncFromApi]);

  return pullDays;
}
