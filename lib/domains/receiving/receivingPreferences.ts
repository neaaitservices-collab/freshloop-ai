import type { MarginMode, RetailUnit } from '@/lib/domains/receiving/yieldPricing';

const STORAGE_KEY = 'freshloop-receiving-prefs-v1';

export interface ReceivingItemPrefs {
  packSize: string;
  yieldDivisor: string;
  retailUnit: RetailUnit;
  marginMode?: MarginMode;
  customMarginPercent?: string;
  supplier?: string;
  updatedAt: string;
}

function normalizeItemKey(itemName: string): string {
  return itemName.trim().toLowerCase();
}

function readStore(): Record<string, ReceivingItemPrefs> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ReceivingItemPrefs>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, ReceivingItemPrefs>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function readReceivingPrefs(itemName: string): ReceivingItemPrefs | null {
  const key = normalizeItemKey(itemName);
  if (!key) return null;
  return readStore()[key] ?? null;
}

export function writeReceivingPrefs(
  itemName: string,
  prefs: Omit<ReceivingItemPrefs, 'updatedAt'>
): void {
  const key = normalizeItemKey(itemName);
  if (!key) return;
  const store = readStore();
  store[key] = { ...prefs, updatedAt: new Date().toISOString() };
  writeStore(store);
}
