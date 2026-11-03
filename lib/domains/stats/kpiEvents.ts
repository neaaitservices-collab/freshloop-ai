import { notifyInventoryUpdated } from '@/lib/domains/inventory/inventoryMoveClient';

/** Dispatched after volumetric scrap or other waste KPI mutations. */
export const FRESHLOOP_KPI_UPDATED = 'freshloop:kpiUpdated';

const KPI_UPDATED_CHANNEL = 'freshloop-kpi-updated';

export function notifyKpiUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FRESHLOOP_KPI_UPDATED));
  notifyInventoryUpdated({ skipWasteKpiRefresh: true });
  try {
    const channel = new BroadcastChannel(KPI_UPDATED_CHANNEL);
    channel.postMessage({ type: 'kpi-updated' });
    channel.close();
  } catch {
    /* BroadcastChannel unavailable */
  }
}

/** Listens for `freshloop:kpiUpdated` (same tab + other tabs via BroadcastChannel). */
export function subscribeKpiUpdated(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const onKpi = () => handler();
  window.addEventListener(FRESHLOOP_KPI_UPDATED, onKpi);

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(KPI_UPDATED_CHANNEL);
    channel.onmessage = () => handler();
  } catch {
    /* ignore */
  }

  return () => {
    window.removeEventListener(FRESHLOOP_KPI_UPDATED, onKpi);
    channel?.close();
  };
}
