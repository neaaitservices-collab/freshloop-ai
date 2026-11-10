'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, LayoutGrid, Search } from 'lucide-react';
import { useRole } from '@/components/auth/RoleProvider';
import { SubInventoryWorkspace } from '@/components/features/inventory/SubInventoryWorkspace';
import { OperationsTransferMetrics } from '@/components/features/operations/OperationsTransferMetrics';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Toast } from '@/components/ui/Toast';
import { useOptimisticInventoryLevels } from '@/hooks/use-optimistic-inventory-levels';
import {
  subscribeInventoryUpdated,
  type InventoryUpdatedDetail,
} from '@/lib/domains/inventory/inventoryMoveClient';
import {
  applyStockLevelPatch,
  filterLevelsWithAnyStock,
  kitchenPrepBalance,
  retailFloorBalance,
  subInventoryTabsForRole,
  type SubInventoryTab,
} from '@/lib/domains/inventory/subInventoryView';
import {
  IN_STOCK_LEVELS_PATH,
  interpretInventoryLevelsBody,
} from '@/lib/domains/inventory/levelsResponse';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import { cn } from '@/lib/utils/cn';

export interface LiveSubInventoryTransfersProps {
  pullDays: number;
  /** Which metric tab is selected first (operations: floor; production: prep). */
  defaultTab?: SubInventoryTab;
  title: string;
  description: string;
  showClerkFloorLink?: boolean;
  /** When set, only these tabs appear in metrics (must still be allowed for role). */
  visibleTabs?: SubInventoryTab[];
  compact?: boolean;
  /** Mobile production tab: use remaining viewport for the SKU list. */
  mobileFillViewport?: boolean;
  /** Hydrated from `/api/production/bootstrap` to skip mount `GET /api/inventory/levels`. */
  initialLevels?: StockLevel[] | null;
}

/** Live ledger levels + operations-style tap-to-modal transfer UI. */
export function LiveSubInventoryTransfers({
  pullDays,
  defaultTab = 'retail_floor',
  title,
  description,
  showClerkFloorLink = false,
  visibleTabs,
  compact = false,
  mobileFillViewport = false,
  initialLevels = null,
}: LiveSubInventoryTransfersProps) {
  const { activeUser } = useRole();
  const { levels, setLevels, performMove } = useOptimisticInventoryLevels(initialLevels);
  const [loading, setLoading] = useState(initialLevels === null);
  const levelCount = useRef(initialLevels?.length ?? 0);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skuQuery, setSkuQuery] = useState('');
  const roleTabs = subInventoryTabsForRole(activeUser?.role);
  const tabs = visibleTabs
    ? visibleTabs.filter((t) => roleTabs.includes(t))
    : roleTabs;
  const initialTab = tabs.includes(defaultTab) ? defaultTab : tabs[0] ?? 'retail_floor';
  const [activeTab, setActiveTab] = useState<SubInventoryTab>(initialTab);
  const floorUnits = retailFloorBalance(levels);
  const kitchenUnits = kitchenPrepBalance(levels);

  useEffect(() => {
    levelCount.current = levels.length;
  }, [levels.length]);

  const loadFullCatalog = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const res = await fetch(IN_STOCK_LEVELS_PATH, { cache: 'no-store' });
        const json = await res.json().catch(() => null);
        const parsed = interpretInventoryLevelsBody(res.ok, json);
        if ('error' in parsed) {
          if (levelCount.current === 0) setError(parsed.error);
          return;
        }
        setLevels(filterLevelsWithAnyStock(parsed.levels as StockLevel[]));
        setError(null);
      } catch {
        if (levelCount.current === 0) setError('Live stock levels could not be loaded.');
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [setLevels]
  );

  const applyLevel = useCallback(
    (level: StockLevel) => {
      setLevels((current) => applyStockLevelPatch(current, level));
    },
    [setLevels]
  );

  useEffect(() => {
    if (!Array.isArray(initialLevels)) return;
    setLevels(filterLevelsWithAnyStock(initialLevels));
    setLoading(false);
    setError(null);
  }, [initialLevels, setLevels]);

  useEffect(() => {
    if (initialLevels === null) {
      void loadFullCatalog();
    }
    const onUpdate = (detail?: InventoryUpdatedDetail) => {
      if (detail?.source === 'level-patch') return;
      if (detail?.level) {
        applyLevel(detail.level);
        return;
      }
      void loadFullCatalog({ silent: true });
    };
    return subscribeInventoryUpdated(onUpdate);
  }, [initialLevels, loadFullCatalog, applyLevel]);

  useEffect(() => {
    if (!tabs.includes(activeTab)) {
      setActiveTab(tabs[0] ?? 'retail_floor');
    }
  }, [tabs, activeTab]);

  const showKitchenTab = tabs.includes('kitchen_prep');

  return (
    <>
      <Card className="min-w-0 max-w-full overflow-hidden border-slate-800/90 bg-slate-950/40">
        <CardHeader
          className={cn(
            'relative z-0 flex min-w-0 flex-col border-b border-slate-800/80',
            compact ? 'gap-2 pb-3 pt-3' : 'gap-4 pb-5'
          )}
        >
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              {!compact ? (
                <span className="hidden rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-emerald-400 sm:flex">
                  <LayoutGrid className="h-5 w-5" />
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                <CardTitle className={compact ? 'text-sm' : 'text-lg'}>{title}</CardTitle>
                {!compact ? (
                  <CardDescription className="mt-1 max-w-xl">{description}</CardDescription>
                ) : null}
              </div>
            </div>
            {showClerkFloorLink ? (
              <Link href="/inventory/floor" className="shrink-0 self-start sm:self-center">
                <Button
                  variant="success"
                  className="min-h-11 w-full gap-2 border-emerald-500/50 bg-emerald-600/90 px-4 text-xs font-bold text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-500 sm:w-auto"
                >
                  Clerk floor view
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </Link>
            ) : null}
          </div>

          {!loading && tabs.length > 0 ? (
            <OperationsTransferMetrics
              floorUnits={floorUnits}
              kitchenUnits={kitchenUnits}
              activeTab={tabs.includes(activeTab) ? activeTab : tabs[0] ?? 'retail_floor'}
              onTabChange={setActiveTab}
              showKitchenTab={showKitchenTab}
              hideFloorTab={!tabs.includes('retail_floor')}
              compact={compact}
            />
          ) : null}

          <div
            className={cn(
              'relative z-40 w-full min-w-0',
              compact ? 'mt-1' : 'mt-2 sm:max-w-md'
            )}
          >
            <Search
              className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
              aria-hidden
            />
            <input
              type="search"
              value={skuQuery}
              onChange={(e) => setSkuQuery(e.target.value)}
              placeholder="Search item, supplier, origin…"
              aria-label="Search inventory SKUs"
              className={cn(
                'w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-white placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none',
                compact ? 'text-xs' : 'min-h-11 text-sm'
              )}
            />
          </div>
        </CardHeader>
        <CardBody
          className={cn(
            'relative z-0 min-w-0 overflow-x-auto',
            compact
              ? cn(
                  'overflow-y-auto pt-2',
                  mobileFillViewport
                    ? 'max-h-[calc(100dvh-13.5rem)]'
                    : 'max-h-[min(70vh,720px)]'
                )
              : 'overflow-y-auto pt-5'
          )}
        >
          {loading || levels.length > 0 || !error ? (
            <SubInventoryWorkspace
              levels={levels}
              loading={loading}
              pullDays={pullDays}
              staffId={activeUser?.id ?? 'staff-operations'}
              retailPriorityOnly={false}
              showRetailCatalog={false}
              layoutVariant="operations"
              listDensity={compact ? 'compact' : 'default'}
              query={skuQuery}
              activeTab={tabs.includes(activeTab) ? activeTab : tabs[0]}
              onActiveTabChange={setActiveTab}
              hideTabSwitcher
              performMove={performMove}
              onSuccess={(message) => {
                setToast(message);
                setError(null);
              }}
              onError={(message) => setError(message)}
            />
          ) : null}
          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-xs font-semibold text-rose-300"
            >
              {error}
            </p>
          ) : null}
        </CardBody>
      </Card>
      <Toast message={toast} onDismiss={() => setToast(null)} variant="success" />
    </>
  );
}
