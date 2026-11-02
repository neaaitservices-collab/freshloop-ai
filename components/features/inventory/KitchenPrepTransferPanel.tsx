'use client';

import React, { useMemo } from 'react';
import { ChefHat } from 'lucide-react';
import { SubInventoryTransferList } from '@/components/features/inventory/SubInventoryTransferList';
import type { PerformInventoryMove } from '@/components/features/inventory/SubInventoryTransferBar';
import { filterKitchenPrepLevels } from '@/lib/domains/inventory/subInventoryView';
import type { StockLevel } from '@/lib/domains/inventory/stock';

export interface KitchenPrepTransferPanelProps {
  levels: StockLevel[];
  staffId?: string;
  query?: string;
  compact?: boolean;
  layoutVariant?: 'default' | 'operations';
  listDensity?: 'default' | 'compact';
  onSuccess: (message: string, level: StockLevel) => void;
  onError: (message: string) => void;
  departmentFilter?: (row: StockLevel) => boolean;
  performMove?: PerformInventoryMove;
}

export function KitchenPrepTransferPanel({
  levels,
  staffId,
  query = '',
  compact,
  layoutVariant = 'default',
  listDensity = 'default',
  onSuccess,
  onError,
  departmentFilter,
  performMove,
}: KitchenPrepTransferPanelProps) {
  const operations = layoutVariant === 'operations';
  const rows = useMemo(() => {
    let list = filterKitchenPrepLevels(levels);
    if (departmentFilter) list = list.filter(departmentFilter);
    const needle = query.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (row) =>
          row.name.toLowerCase().includes(needle) ||
          row.supplier.toLowerCase().includes(needle)
      );
    }
    return list.sort((a, b) => b.kitchenPrepQty - a.kitchenPrepQty || a.name.localeCompare(b.name));
  }, [levels, query, departmentFilter]);

  return (
    <div
      className={
        operations
          ? 'min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-800/90 bg-slate-900/50'
          : 'overflow-hidden rounded-2xl border border-amber-900/40 bg-slate-950/80'
      }
    >
      <div
        className={
          listDensity === 'compact'
            ? 'flex items-center gap-2 border-b border-slate-800 px-3 py-2'
            : 'flex items-center gap-2 border-b border-slate-800 px-4 py-3'
        }
      >
        <ChefHat className="h-4 w-4 text-amber-400" />
        <div>
          <h3 className="text-xs font-black text-white sm:text-sm">Production prep</h3>
          {listDensity !== 'compact' ? (
            <p className="text-[11px] text-slate-400">
              Transferred inventory &amp; BOM inputs — record scrap waste or run recipe manufacturing.
            </p>
          ) : null}
        </div>
        <span className="ml-auto rounded-full border border-amber-500/30 bg-amber-950/50 px-2.5 py-0.5 text-[10px] font-bold text-amber-200">
          {rows.length} SKUs
        </span>
      </div>
      <SubInventoryTransferList
        rows={rows}
        location="kitchen_prep"
        staffId={staffId}
        compact={compact}
        layoutVariant={layoutVariant}
        listDensity={listDensity}
        performMove={performMove}
        emptyMessage="No kitchen prep stock — rescue from the retail floor first."
        onSuccess={onSuccess}
        onError={onError}
      />
    </div>
  );
}
