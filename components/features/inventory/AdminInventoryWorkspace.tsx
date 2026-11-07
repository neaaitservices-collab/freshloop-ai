'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRole } from '@/components/auth/RoleProvider';
import { useStableNavRole } from '@/hooks/use-stable-nav-role';
import { InventoryFilterBar } from '@/components/features/inventory/InventoryFilterBar';
import { InventoryDataGrid } from '@/components/features/inventory/InventoryDataGrid';
import { ItemSettingsModal } from '@/components/features/inventory/ItemSettingsModal';
import {
  applyInventoryFilters,
  EMPTY_INVENTORY_FILTERS,
  groupInventoryRows,
  type InventoryFilters,
  type InventoryGroupBy,
  uniqueFilterOptions,
} from '@/lib/domains/inventory/inventoryCatalog';
import type { StockLevel, StockOverrideAudit } from '@/lib/domains/inventory/stock';
import { applyOptimisticStockCases } from '@/lib/domains/inventory/optimisticStock';
import {
  notifyInventoryUpdated,
  type InventoryUpdatedDetail,
} from '@/lib/domains/inventory/inventoryMoveClient';
import { canOverrideInventoryStock } from '@/lib/auth/staffCapabilities';
import { CatalogDuplicateMergePanel } from '@/components/features/inventory/CatalogDuplicateMergePanel';
import { OFFLINE_MUTATION_KIND } from '@/lib/offline/types';
import { patchJsonOrQueue } from '@/lib/offline/mutationClient';
import { createClientMutationId } from '@/lib/offline/queue';

export function AdminInventoryWorkspace({
  levels: initialLevels,
}: {
  levels: StockLevel[] | null;
}) {
  const loading = initialLevels === null;
  const [levels, setLevels] = useState<StockLevel[]>(() => initialLevels ?? []);
  const [filters, setFilters] = useState<InventoryFilters>(EMPTY_INVENTORY_FILTERS);
  const [groupBy, setGroupBy] = useState<InventoryGroupBy>('department');
  const [modalRow, setModalRow] = useState<StockLevel | null>(null);
  const [levelsRefreshError, setLevelsRefreshError] = useState<string | null>(null);

  const { activeUser } = useRole();
  const { role: stableRole } = useStableNavRole();
  const effectiveRole = activeUser?.role ?? stableRole;
  const canOverride = Boolean(
    effectiveRole && canOverrideInventoryStock(effectiveRole)
  );
  const canRemoveFromCatalog = effectiveRole === 'ADMIN';
  const isAdmin = effectiveRole === 'ADMIN';

  useEffect(() => {
    if (!initialLevels) return;
    setLevels(initialLevels);
  }, [initialLevels]);

  useEffect(() => {
    const refreshLevelsFromApi = () => {
      void fetch('/api/inventory/levels', { cache: 'no-store' })
        .then(async (res) => {
          const json = (await res.json()) as {
            success?: boolean;
            levels?: StockLevel[];
            error?: string;
          };
          if (!res.ok || !json.success) {
            setLevelsRefreshError(json.error ?? 'Could not refresh catalog.');
            return;
          }
          if (Array.isArray(json.levels)) {
            setLevelsRefreshError(null);
            setLevels(json.levels);
          }
        })
        .catch((err: unknown) => {
          setLevelsRefreshError('Network error — catalog may be out of date.');
          console.error('[freshloop] AdminInventoryWorkspace refresh levels', err);
        });
    };

    const refreshLevels = (event: Event) => {
      const detail = (event as CustomEvent<InventoryUpdatedDetail>).detail;
      if (detail?.source === 'level-patch' && detail.level) {
        setLevels((current) =>
          current.map((row) => (row.productId === detail.level!.productId ? detail.level! : row))
        );
        return;
      }
      refreshLevelsFromApi();
    };
    window.addEventListener('freshloop-inventory-updated', refreshLevels);
    return () => window.removeEventListener('freshloop-inventory-updated', refreshLevels);
  }, []);

  const catalog = useMemo(
    () => [...levels].sort((a, b) => a.name.localeCompare(b.name)),
    [levels]
  );

  const filterOptions = useMemo(() => uniqueFilterOptions(catalog), [catalog]);
  const filtered = useMemo(() => applyInventoryFilters(catalog, filters), [catalog, filters]);
  const groups = useMemo(() => groupInventoryRows(filtered, groupBy), [filtered, groupBy]);

  const patchLevel = (level: StockLevel) => {
    setLevels((current) => current.map((row) => (row.productId === level.productId ? level : row)));
    setModalRow((current) => (current?.productId === level.productId ? level : current));
  };

  return (
    <section className="min-w-0 space-y-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300/90">Inventory catalog</p>
        <h2 className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">Stock & margin control</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Full product catalog from the database. Items stay listed at zero stock. Admins can merge duplicate
          SKUs (same item, different invoice names) or remove a SKU from the catalog.
        </p>
      </div>

      {levelsRefreshError ? (
        <p className="rounded-xl border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          {levelsRefreshError}
        </p>
      ) : null}

      {isAdmin ? (
        <CatalogDuplicateMergePanel
          onMerged={() => {
            void fetch('/api/inventory/levels', { cache: 'no-store' })
              .then(async (res) => {
                const json = (await res.json()) as {
                  success?: boolean;
                  levels?: StockLevel[];
                  error?: string;
                };
                if (!res.ok || !json.success) {
                  setLevelsRefreshError(json.error ?? 'Could not refresh catalog after merge.');
                  return;
                }
                if (Array.isArray(json.levels)) {
                  setLevelsRefreshError(null);
                  setLevels(json.levels);
                }
              })
              .catch((err: unknown) => {
                setLevelsRefreshError('Network error — catalog may be out of date.');
                console.error('[freshloop] AdminInventoryWorkspace merge refresh', err);
              });
          }}
        />
      ) : null}

      <InventoryFilterBar
        filters={filters}
        onChange={setFilters}
        groupBy={groupBy}
        onGroupBy={setGroupBy}
        options={filterOptions}
        resultCount={filtered.length}
        onReset={() => setGroupBy('department')}
      />

      <InventoryDataGrid groups={groups} loading={loading} onSelect={setModalRow} />

      <ItemSettingsModal
        row={modalRow}
        open={modalRow !== null}
        onClose={() => setModalRow(null)}
        canOverride={canOverride}
        canRemoveFromCatalog={canRemoveFromCatalog}
        onRemoveFromCatalog={async () => {
          if (!modalRow) return;
          const res = await fetch(
            `/api/inventory/levels?productId=${encodeURIComponent(modalRow.productId)}`,
            { method: 'DELETE' }
          );
          const json = await res.json();
          if (!res.ok || !json.success) {
            throw new Error(json.error || 'Could not remove item from catalog.');
          }
          setLevels((current) => current.filter((row) => row.productId !== modalRow.productId));
          setModalRow(null);
          notifyInventoryUpdated({
            productId: modalRow.productId,
          });
        }}
        onSaveMetadata={async (payload) => {
          if (!modalRow) return;
          const res = await fetch('/api/inventory/levels', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: modalRow.productId,
              department: payload.department,
              supplier: payload.supplier,
              origin: payload.origin || null,
              pullSensitivityDays: payload.pullSensitivityDays,
              parCases: payload.parCases,
            }),
          });
          const json = await res.json();
          if (!res.ok || !json.success) throw new Error(json.error || 'Could not save metadata.');
          patchLevel(json.level as StockLevel);
          notifyInventoryUpdated({
            level: json.level as StockLevel,
            productId: modalRow.productId,
            source: 'level-patch',
          });
        }}
        onSaveCase={async (payload) => {
          if (!modalRow) return;
          const res = await fetch('/api/inventory/levels', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: modalRow.productId,
              packSize: payload.packSize,
              splitFactor: payload.splitFactor,
              retailUnit: payload.retailUnit,
              retailPrice: payload.retailPrice,
              ...(payload.caseRetailPrice !== undefined
                ? { caseRetailPrice: payload.caseRetailPrice }
                : {}),
              caseCost: payload.caseCost,
            }),
          });
          const json = await res.json();
          if (!res.ok || !json.success) throw new Error(json.error || 'Could not save case.');
          patchLevel(json.level as StockLevel);
          notifyInventoryUpdated({
            level: json.level as StockLevel,
            productId: modalRow.productId,
            source: 'level-patch',
          });
        }}
        onUpdatePhysicalCount={async (cases) => {
          if (!modalRow) throw new Error('No item selected.');
          const snapshot = modalRow;
          patchLevel(applyOptimisticStockCases(snapshot, cases));
          const clientMutationId = createClientMutationId();
          const result = await patchJsonOrQueue<{
            success: boolean;
            level?: StockLevel;
            audit?: StockOverrideAudit;
            error?: string;
          }>({
            kind: OFFLINE_MUTATION_KIND.STOCK_COUNT,
            url: '/api/inventory/levels',
            label: `Count ${snapshot.name}`,
            body: {
              productId: snapshot.productId,
              casesOnHand: cases,
              clientMutationId,
            },
          });
          if (result.ok && result.offline) {
            notifyInventoryUpdated({
              productId: snapshot.productId,
              source: 'level-patch',
              skipStatsRefresh: true,
            });
            return null;
          }
          if (!result.ok) {
            patchLevel(snapshot);
            throw new Error(result.error || 'Stock could not be updated.');
          }
          const json = result.data;
          if (!json.success || !json.level) {
            patchLevel(snapshot);
            throw new Error(json.error || 'Stock could not be updated.');
          }
          patchLevel(json.level);
          notifyInventoryUpdated({
            level: json.level,
            productId: snapshot.productId,
            source: 'level-patch',
            skipStatsRefresh: true,
          });
          return json.audit ?? null;
        }}
      />
    </section>
  );
}
