'use client';

import React, { useMemo } from 'react';
import { Store } from 'lucide-react';
import {
  SubInventoryTransferList,
} from '@/components/features/inventory/SubInventoryTransferList';
import type { PerformInventoryMove } from '@/components/features/inventory/SubInventoryTransferBar';
import { filterRetailFloorLevels } from '@/lib/domains/inventory/subInventoryView';
import type { StockLevel } from '@/lib/domains/inventory/stock';

export interface RetailFloorTransferPanelProps {
  levels: StockLevel[];
  pullDays?: number;
  staffId?: string;
  /** When true, only short-dated / low / markdown items (floor action board). */
  priorityOnly?: boolean;
  department?: string;
  query?: string;
  compact?: boolean;
  onSuccess: (message: string, level: StockLevel) => void;
  onError: (message: string) => void;
  departmentFilter?: (row: StockLevel) => boolean;
  performMove?: PerformInventoryMove;
}

export function RetailFloorTransferPanel({
  levels,
  pullDays = 3,
  staffId,
  priorityOnly = false,
  query = '',
  compact,
  onSuccess,
  onError,
  departmentFilter,
  performMove,
}: RetailFloorTransferPanelProps) {
  const rows = useMemo(() => {
    let list = filterRetailFloorLevels(levels);
    if (departmentFilter) list = list.filter(departmentFilter);
    const needle = query.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (row) =>
          row.name.toLowerCase().includes(needle) ||
          row.supplier.toLowerCase().includes(needle)
      );
    }
    if (priorityOnly) {
      list = list.filter(
        (row) => row.daysRemaining <= pullDays || row.low || row.isMarkdown
      );
    }
    return list.sort(
      (a, b) =>
        (priorityOnly ? a.daysRemaining - b.daysRemaining : 0) ||
        a.name.localeCompare(b.name)
    );
  }, [levels, pullDays, priorityOnly, query, departmentFilter]);

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-900/40 bg-slate-950/80">
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
        <Store className="h-4 w-4 text-emerald-400" />
        <div>
          <h3 className="text-sm font-black text-white">
            {priorityOnly ? 'Short-Dated Action Queue' : 'Retail floor'}
          </h3>
          <p className="text-[11px] text-slate-400">
            {priorityOnly
              ? 'Pull window items — swipe on mobile or use the action buttons.'
              : `Shelf stock — send to kitchen, markdown, or waste (choose qty in ${rows[0] ? 'lbs/units' : 'each unit'}).`}
          </p>
        </div>
        <span className="ml-auto rounded-full border border-emerald-500/30 bg-emerald-950/50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
          {rows.length} SKUs
        </span>
      </div>
      <SubInventoryTransferList
        rows={rows}
        location="retail_floor"
        pullDays={pullDays}
        staffId={staffId}
        compact={compact}
        actionQueue={priorityOnly}
        performMove={performMove}
        emptyMessage={
          priorityOnly
            ? 'Nothing flagged on the floor for this pull window.'
            : 'No retail floor stock to move.'
        }
        onSuccess={onSuccess}
        onError={onError}
      />
    </div>
  );
}
