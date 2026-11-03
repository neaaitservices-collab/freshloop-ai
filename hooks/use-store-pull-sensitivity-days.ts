'use client';

import { useEffect, useState } from 'react';

export type StorePullSensitivityDays = 2 | 3 | 4;

function normalizePullDays(value: unknown): StorePullSensitivityDays {
  if (value === 2 || value === 3 || value === 4) return value;
  return 3;
}

/** Store-wide pull window from platform settings (all staff). */
export function useStorePullSensitivityDays() {
  const [pullDays, setPullDays] = useState<StorePullSensitivityDays>(3);

  useEffect(() => {
    void fetch('/api/admin/settings', { cache: 'no-store' })
      .then((response) => response.json())
      .then((json) => {
        if (json?.success && json.settings) {
          setPullDays(normalizePullDays(json.settings.pullSensitivityDays));
        }
      })
      .catch(() => undefined);
  }, []);

  return pullDays;
}
