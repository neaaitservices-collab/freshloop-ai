import { notifyInventoryUpdated } from '@/lib/domains/inventory/inventoryMoveClient';
import type { StockLevel } from '@/lib/domains/inventory/stock';

export type PatchInventoryLevelBody = Record<string, unknown>;

export async function patchInventoryLevel(
  body: PatchInventoryLevelBody
): Promise<{ success: boolean; level?: StockLevel; error?: string }> {
  try {
    const response = await fetch('/api/inventory/levels', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as {
      success?: boolean;
      level?: StockLevel;
      error?: string;
    };
    if (!response.ok || !json.success || !json.level) {
      return { success: false, error: json.error ?? 'Could not update inventory.' };
    }
    notifyInventoryUpdated();
    return { success: true, level: json.level };
  } catch {
    return { success: false, error: 'Could not reach the inventory server.' };
  }
}
