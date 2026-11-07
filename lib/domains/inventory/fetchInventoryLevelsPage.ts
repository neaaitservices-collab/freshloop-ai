import type { StockLevel } from '@/lib/domains/inventory/stock';
import type { InventoryLevelsListPayload } from '@/lib/domains/inventory/levelsList';

export type InventoryLevelsPageResult = {
  levels: StockLevel[];
  total: number;
  limit: number;
  offset: number;
};

export async function fetchInventoryLevelsAll(): Promise<StockLevel[]> {
  const res = await fetch('/api/inventory/levels', { cache: 'no-store' });
  const json = (await res.json()) as Partial<InventoryLevelsListPayload> & {
    success?: boolean;
    error?: string;
  };
  if (!res.ok || !json.success || !Array.isArray(json.levels)) {
    throw new Error(json.error ?? 'Could not load full catalog.');
  }
  return json.levels;
}

export async function fetchInventoryLevelsPage(
  limit: number,
  offset: number
): Promise<InventoryLevelsPageResult> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const res = await fetch(`/api/inventory/levels?${params.toString()}`, { cache: 'no-store' });
  const json = (await res.json()) as Partial<InventoryLevelsListPayload> & {
    success?: boolean;
    error?: string;
  };
  if (!res.ok || !json.success || !Array.isArray(json.levels)) {
    throw new Error(json.error ?? 'Could not load inventory page.');
  }
  return {
    levels: json.levels,
    total: typeof json.total === 'number' ? json.total : json.levels.length,
    limit: typeof json.limit === 'number' ? json.limit : limit,
    offset: typeof json.offset === 'number' ? json.offset : offset,
  };
}
