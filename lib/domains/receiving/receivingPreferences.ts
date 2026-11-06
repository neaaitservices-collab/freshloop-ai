import type { MarginMode, RetailUnit } from '@/lib/domains/receiving/yieldPricing';

const STORAGE_KEY = 'freshloop-receiving-prefs-v1';

export interface ReceivingItemPrefs {
  packSize: string;
  splitFactor: string;
  retailUnit: RetailUnit;
  marginMode?: MarginMode;
  customMarginPercent?: string;
  supplier?: string;
  updatedAt: string;
}

function normalizeItemKey(itemName: string): string {
  return itemName.trim().toLowerCase();
}

type StoredReceivingPrefs = Partial<ReceivingItemPrefs> & { yieldDivisor?: string };

function normalizeStoredPrefs(raw: StoredReceivingPrefs): ReceivingItemPrefs | null {
  if (!raw || typeof raw !== 'object') return null;
  const packSize = typeof raw.packSize === 'string' ? raw.packSize : null;
  const splitFactor =
    typeof raw.splitFactor === 'string'
      ? raw.splitFactor
      : typeof raw.yieldDivisor === 'string'
        ? raw.yieldDivisor
        : null;
  const retailUnit = raw.retailUnit;
  if (!packSize || !splitFactor || !retailUnit) return null;
  return {
    packSize,
    splitFactor,
    retailUnit,
    marginMode: raw.marginMode,
    customMarginPercent: raw.customMarginPercent,
    supplier: raw.supplier,
    updatedAt: raw.updatedAt ?? new Date(0).toISOString(),
  };
}

function readStore(): Record<string, ReceivingItemPrefs> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StoredReceivingPrefs>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, ReceivingItemPrefs> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const normalized = normalizeStoredPrefs(value);
      if (normalized) out[key] = normalized;
    }
    return out;
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
