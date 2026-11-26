'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  normalizePullSensitivityDays,
  type PullSensitivityDays,
} from '@/lib/domains/inventory/pullSensitivity';
import {
  FRESHLOOP_SETTINGS_UPDATED,
  readSettingsUpdatedEvent,
} from '@/lib/domains/stats/settingsEvents';

export type StorePullSensitivityDays = PullSensitivityDays;

export function seededPullDays(value: unknown): StorePullSensitivityDays | null {
  if (value === 2 || value === 3 || value === 4) return value;
  return null;
}

/** A server-passed 2, 3, or 4 is already the saved window. Do not GET on mount. */
export function planPullWindowLoad(initial: unknown):
  | { type: 'use-initial'; days: StorePullSensitivityDays }
  | { type: 'fetch' } {
  const seeded = seededPullDays(initial);
  if (seeded != null) return { type: 'use-initial', days: seeded };
  return { type: 'fetch' };
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'AbortError'
  );
}

/**
 * Store-wide pull window from platform settings.
 * A valid `initial` is shown immediately and is re-applied when the prop changes
 * (including after `router.refresh()`). A later GET cannot overwrite a newer save.
 */
export function useStorePullSensitivityDays(initial?: number | null): {
  pullDays: StorePullSensitivityDays | null;
  ready: boolean;
  failed: boolean;
  retry: () => void;
} {
  const [pullDays, setPullDays] = useState<StorePullSensitivityDays | null>(() =>
    seededPullDays(initial)
  );
  const [ready, setReady] = useState(() => seededPullDays(initial) != null);
  const [failed, setFailed] = useState(false);
  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const invalidateInflight = useCallback(() => {
    requestId.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const syncFromApi = useCallback(async () => {
    requestId.current += 1;
    const id = requestId.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch('/api/admin/settings', {
        cache: 'no-store',
        signal: controller.signal,
      });
      const json = (await response.json().catch(() => null)) as {
        success?: boolean;
        settings?: { pullSensitivityDays?: unknown };
      } | null;
      if (id !== requestId.current) return;
      if (response.ok && json?.success && json.settings) {
        setPullDays(normalizePullSensitivityDays(json.settings.pullSensitivityDays));
        setReady(true);
        setFailed(false);
        return;
      }
      setFailed(true);
      setReady(true);
    } catch (error) {
      if (id !== requestId.current || isAbortError(error)) return;
      setFailed(true);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    const plan = planPullWindowLoad(initial);
    if (plan.type === 'use-initial') {
      invalidateInflight();
      setPullDays(plan.days);
      setReady(true);
      setFailed(false);
      return;
    }
    void syncFromApi();
  }, [initial, invalidateInflight, syncFromApi]);

  useEffect(() => {
    return () => {
      requestId.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onSettings = (event: Event) => {
      const settings = readSettingsUpdatedEvent(event);
      if (settings?.pullSensitivityDays != null) {
        invalidateInflight();
        setPullDays(normalizePullSensitivityDays(settings.pullSensitivityDays));
        setReady(true);
        setFailed(false);
        return;
      }
      void syncFromApi();
    };
    window.addEventListener(FRESHLOOP_SETTINGS_UPDATED, onSettings);
    return () => window.removeEventListener(FRESHLOOP_SETTINGS_UPDATED, onSettings);
  }, [invalidateInflight, syncFromApi]);

  const retry = useCallback(() => {
    setFailed(false);
    setReady(seededPullDays(pullDays) != null);
    void syncFromApi();
  }, [pullDays, syncFromApi]);

  return { pullDays, ready, failed, retry };
}
