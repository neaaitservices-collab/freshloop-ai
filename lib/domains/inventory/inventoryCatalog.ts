import type { StockLevel } from '@/lib/domains/inventory/stock';
import { fieldMatchesNeedle } from '@/lib/utils/searchNeedle';

export type InventoryGroupBy = 'none' | 'department' | 'supplier';

export interface InventoryFilters {
  query: string;
  department: string;
  category: string;
  productType: string;
  origin: string;
  supplier: string;
}

export const EMPTY_INVENTORY_FILTERS: InventoryFilters = {
  query: '',
  department: 'ALL',
  category: 'ALL',
  productType: 'ALL',
  origin: 'ALL',
  supplier: 'ALL',
};

export function inventoryFiltersAreDefault(filters: InventoryFilters): boolean {
  return (
    filters.query.trim() === '' &&
    filters.department === 'ALL' &&
    filters.category === 'ALL' &&
    filters.productType === 'ALL' &&
    filters.origin === 'ALL' &&
    filters.supplier === 'ALL'
  );
}

const DEPARTMENT_LABELS: Record<string, string> = {
  PRODUCE: 'Produce',
  DAIRY: 'Dairy',
  BAKERY: 'Bakery',
  PANTRY: 'Pantry',
  DELI_KITCHEN: 'Deli / Kitchen',
};

export function departmentLabel(code: string): string {
  return DEPARTMENT_LABELS[code] ?? code.replace(/_/g, ' ');
}

export function categoryForRow(row: StockLevel): string {
  return departmentLabel(row.department);
}

export function uniqueFilterOptions(levels: StockLevel[]) {
  const departments = new Set<string>();
  const categories = new Set<string>();
  const types = new Set<string>();
  const origins = new Set<string>();
  const suppliers = new Set<string>();

  for (const row of levels) {
    departments.add(row.department);
    categories.add(categoryForRow(row));
    types.add(row.productType);
    if (row.origin?.trim()) origins.add(row.origin.trim());
    suppliers.add(row.supplier);
  }

  const sort = (a: string, b: string) => a.localeCompare(b);
  return {
    departments: ['ALL', ...Array.from(departments).sort(sort)],
    categories: ['ALL', ...Array.from(categories).sort(sort)],
    productTypes: ['ALL', ...Array.from(types).sort(sort)],
    origins: ['ALL', ...Array.from(origins).sort(sort)],
    suppliers: ['ALL', ...Array.from(suppliers).sort(sort)],
  };
}

export function applyInventoryFilters(
  levels: StockLevel[],
  filters: InventoryFilters,
  opts?: { inStockOnly?: boolean }
): StockLevel[] {
  const needle = filters.query.trim().toLowerCase();
  return levels.filter((row) => {
    if (opts?.inStockOnly && row.onHand <= 0) return false;
    if (filters.department !== 'ALL' && row.department !== filters.department) return false;
    if (filters.category !== 'ALL' && categoryForRow(row) !== filters.category) return false;
    if (filters.productType !== 'ALL' && row.productType !== filters.productType) return false;
    if (filters.origin !== 'ALL' && (row.origin?.trim() ?? '') !== filters.origin) return false;
    if (filters.supplier !== 'ALL' && row.supplier !== filters.supplier) return false;
    if (!needle) return true;
    return (
      fieldMatchesNeedle(row.name, needle) ||
      fieldMatchesNeedle(row.supplier, needle) ||
      fieldMatchesNeedle(row.origin, needle)
    );
  });
}

export function groupInventoryRows(
  rows: StockLevel[],
  groupBy: InventoryGroupBy
): Array<{ key: string; label: string; rows: StockLevel[] }> {
  if (groupBy === 'none') {
    return [{ key: 'all', label: 'All items', rows }];
  }
  const map = new Map<string, StockLevel[]>();
  for (const row of rows) {
    const key =
      groupBy === 'supplier'
        ? row.supplier
        : groupBy === 'department'
          ? row.department
          : 'all';
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, groupRows]) => ({
      key,
      label:
        groupBy === 'department'
          ? departmentLabel(key)
          : groupBy === 'supplier'
            ? key
            : 'All items',
      rows: groupRows.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}
