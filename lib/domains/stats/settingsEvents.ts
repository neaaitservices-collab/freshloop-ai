import type { PlatformSettings } from '@/lib/domains/stats/platformSettings';

export const FRESHLOOP_SETTINGS_UPDATED = 'freshloop-settings-updated';

export function dispatchSettingsUpdated(settings?: PlatformSettings): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FRESHLOOP_SETTINGS_UPDATED, { detail: settings }));
}

export function readSettingsUpdatedEvent(event: Event): PlatformSettings | undefined {
  const detail = (event as CustomEvent<PlatformSettings>).detail;
  return detail && typeof detail === 'object' ? detail : undefined;
}
