import type { StockLevel } from '@/lib/domains/inventory/stock';

export type InventoryUpdatedDetail = {
  level?: StockLevel;
  productId?: string;
  /** List already patched this level (skip duplicate merges in listeners). */
  source?: 'level-patch';
  /** Waste KPI state already returned from volumetric-scrap POST. */
  skipWasteKpiRefresh?: boolean;
  /** Skip debounced `/api/admin/stats` refresh (e.g. single-SKU case override). */
  skipStatsRefresh?: boolean;
};

const INVENTORY_UPDATED_CHANNEL = 'freshloop-inventory-updated';

export function notifyInventoryUpdated(detail?: InventoryUpdatedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('freshloop-inventory-updated', { detail }));
  try {
    const channel = new BroadcastChannel(INVENTORY_UPDATED_CHANNEL);
    channel.postMessage({ type: 'inventory-updated' });
    channel.close();
  } catch {
    /* BroadcastChannel unavailable */
  }
}

/** Same-tab + other browser tabs (Admin while logging on Production). */
export function subscribeInventoryUpdated(
  handler: (detail?: InventoryUpdatedDetail) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const onWindow = (event: Event) => {
    const detail = (event as CustomEvent<InventoryUpdatedDetail>).detail;
    handler(detail);
  };
  window.addEventListener('freshloop-inventory-updated', onWindow);

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(INVENTORY_UPDATED_CHANNEL);
    channel.onmessage = () => handler();
  } catch {
    /* ignore */
  }

  return () => {
    window.removeEventListener('freshloop-inventory-updated', onWindow);
    channel?.close();
  };
}
