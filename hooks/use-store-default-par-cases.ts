'use client';

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PAR_CASES, normalizeParCases } from '@/lib/domains/inventory/parLevel';
import {
  FRESHLOOP_SETTINGS_UPDATED,
  readSettingsUpdatedEvent,
} from '@/lib/domains/stats/settingsEvents';

/** Store-wide minimum stock (cases) from platform settings. */
export function useStoreDefaultParCases() {
  const [parCases, setParCases] = useState(DEFAULT_PAR_CASES);

  const syncFromApi = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/settings', { cache: 'no-store' });
      const json = await response.json();
      if (json?.success && json.settings) {
        setParCases(normalizeParCases(json.settings.defaultParCases));
      }
    } catch {
      /* keep current */
    }
  }, []);

  useEffect(() => {
    void syncFromApi();
    const onSettings = (event: Event) => {
      const settings = readSettingsUpdatedEvent(event);
      if (settings?.defaultParCases != null) {
        setParCases(normalizeParCases(settings.defaultParCases));
        return;
      }
      void syncFromApi();
    };
    window.addEventListener(FRESHLOOP_SETTINGS_UPDATED, onSettings);
    return () => window.removeEventListener(FRESHLOOP_SETTINGS_UPDATED, onSettings);
  }, [syncFromApi]);

  return parCases;
}
