import type { StockLevel } from '@/lib/domains/inventory/stock';

const DEFAULT_MAX_LIMIT = 500;

export function parseLevelsPagination(
  limitRaw: string | null,
  offsetRaw: string | null
): { limit?: number; offset: number } {
  const offset = Math.max(0, Number.parseInt(offsetRaw ?? '0', 10) || 0);
  if (limitRaw === null || limitRaw.trim() === '') {
    return { offset: 0 };
  }
  const parsed = Number.parseInt(limitRaw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { offset: 0 };
  }
  return {
    limit: Math.min(parsed, DEFAULT_MAX_LIMIT),
    offset,
  };
}

export function paginateStockLevels<T extends StockLevel>(
  levels: T[],
  limit?: number,
  offset = 0
): { page: T[]; total: number; limit: number; offset: number } {
  const total = levels.length;
  if (limit === undefined) {
    return { page: levels, total, limit: total, offset: 0 };
  }
  const safeOffset = Math.min(Math.max(0, offset), total);
  return {
    page: levels.slice(safeOffset, safeOffset + limit),
    total,
    limit,
    offset: safeOffset,
  };
}

export interface InventoryLevelsListPayload {
  success: true;
  parCases: number;
  count: number;
  lowCount: number;
  orderCost: number;
  levels: StockLevel[];
  total: number;
  limit: number;
  offset: number;
}
