'use client';

import React, { useMemo, useState } from 'react';
import { useRole } from '@/components/auth/RoleProvider';
import { KitchenPrepTransferPanel } from '@/components/features/inventory/KitchenPrepTransferPanel';
import { RetailFloorTransferPanel } from '@/components/features/inventory/RetailFloorTransferPanel';
import {
  defaultSubInventoryTab,
  kitchenPrepBalance,
  retailFloorBalance,
  SUB_INVENTORY_TAB_LABELS,
  subInventoryTabsForRole,
  type SubInventoryTab,
} from '@/lib/domains/inventory/subInventoryView';
import type { PerformInventoryMove } from '@/components/features/inventory/SubInventoryTransferBar';
import type { StockLevel } from '@/lib/domains/inventory/stock';

export interface SubInventoryWorkspaceProps {
  levels: StockLevel[];
  loading?: boolean;
  pullDays?: number;
  staffId?: string;
  query?: string;
  departmentFilter?: (row: StockLevel) => boolean;
  /** Retail tab: show only pull-flagged SKUs (action board). */
  retailPriorityOnly?: boolean;
  showRetailCatalog?: boolean;
  onSuccess: (message: string, level: StockLevel) => void;
  onError: (message: string) => void;
  performMove?: PerformInventoryMove;
}

export function SubInventoryWorkspace({
  levels,
  loading,
  pullDays = 3,
  staffId,
  query = '',
  departmentFilter,
  retailPriorityOnly = true,
  showRetailCatalog = true,
  onSuccess,
  onError,
  performMove,
}: SubInventoryWorkspaceProps) {
  const { activeUser } = useRole();
  const tabs = useMemo(
    () => subInventoryTabsForRole(activeUser?.role),
    [activeUser?.role]
  );
  const [activeTab, setActiveTab] = useState<SubInventoryTab>(() =>
    defaultSubInventoryTab(activeUser?.role)
  );

  const safeTab = tabs.includes(activeTab) ? activeTab : tabs[0] ?? 'retail_floor';
  const floorUnits = retailFloorBalance(levels);
  const kitchenUnits = kitchenPrepBalance(levels);

  if (loading) {
    return (
      <div className="space-y-2 rounded-2xl border border-slate-800 p-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-800/80" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tabs.length > 1 ? (
        <div
          className="flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-1.5"
          role="tablist"
          aria-label="Sub-inventories"
        >
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={safeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`min-h-12 flex-1 min-w-[8rem] rounded-xl px-3 py-3 text-left text-xs font-bold transition sm:flex-none sm:min-w-[10rem] ${
                safeTab === tab
                  ? tab === 'retail_floor'
                    ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-100 ring-1 ring-amber-500/40'
                  : 'text-slate-400 hover:bg-slate-800/80'
              }`}
            >
              {SUB_INVENTORY_TAB_LABELS[tab]}
              <span className="mt-0.5 block font-mono text-[10px] opacity-80">
                {tab === 'retail_floor'
                  ? `${floorUnits.toFixed(1)} u on floor`
                  : `${kitchenUnits.toFixed(1)} u in prep`}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500/90">
          Retail floor transfers
        </p>
      )}

      {(safeTab === 'retail_floor' || tabs.length === 1) && tabs.includes('retail_floor') ? (
        <>
          <RetailFloorTransferPanel
            levels={levels}
            pullDays={pullDays}
            staffId={staffId}
            priorityOnly={retailPriorityOnly}
            query={query}
            departmentFilter={departmentFilter}
            onSuccess={onSuccess}
            onError={onError}
            performMove={performMove}
          />
          {showRetailCatalog && retailPriorityOnly ? (
            <details className="group rounded-2xl border border-slate-800 bg-slate-950/60">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-slate-300 marker:content-none">
                All floor stock (full catalog)
              </summary>
              <RetailFloorTransferPanel
                levels={levels}
                pullDays={pullDays}
                staffId={staffId}
                priorityOnly={false}
                query={query}
                departmentFilter={departmentFilter}
                compact
                onSuccess={onSuccess}
                onError={onError}
                performMove={performMove}
              />
            </details>
          ) : null}
        </>
      ) : null}

      {safeTab === 'kitchen_prep' && tabs.includes('kitchen_prep') ? (
        <KitchenPrepTransferPanel
          levels={levels}
          staffId={staffId}
          query={query}
          departmentFilter={departmentFilter}
          onSuccess={onSuccess}
          onError={onError}
          performMove={performMove}
        />
      ) : null}
    </div>
  );
}
