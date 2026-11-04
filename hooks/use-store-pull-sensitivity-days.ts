'use client';

import { useStoreSettings } from '@/hooks/use-store-settings';

export type StorePullSensitivityDays = 2 | 3 | 4;

function normalizePullDays(value: unknown): StorePullSensitivityDays {
  if (value === 2 || value === 3 || value === 4) return value;
  return 3;
}

/** Store-wide pull window from platform settings (all staff), coalesced across components. */
export function useStorePullSensitivityDays(): StorePullSensitivityDays {
  const { settings } = useStoreSettings();
  return normalizePullDays(settings.pullSensitivityDays);
}
