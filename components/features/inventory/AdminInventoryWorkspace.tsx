'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRole } from '@/components/auth/RoleProvider';
import { useStableNavRole } from '@/hooks/use-stable-nav-role';
import { InventoryFilterBar } from '@/components/features/inventory/InventoryFilterBar';
import { InventoryDataGrid } from '@/components/features/inventory/InventoryDataGrid';
import { ItemSettingsModal } from '@/components/features/inventory/ItemSettingsModal';
import {
  applyInventoryFilters,
  EMPTY_INVENTORY_FILTERS,
  groupInventoryRows,
  inventoryFiltersAreDefault,
  type InventoryFilters,
  type InventoryGroupBy,
  uniqueFilterOptions,
} from '@/lib/domains/inventory/inventoryCatalog';
import type { StockLevel, StockOverrideAudit } from '@/lib/domains/inventory/stock';
import { applyOptimisticStockCases } from '@/lib/domains/inventory/optimisticStock';
import {
  notifyInventoryUpdated,
  subscribeInventoryUpdated,
  type InventoryUpdatedDetail,
} from '@/lib/domains/inventory/inventoryMoveClient';
import { canOverrideInventoryStock } from '@/lib/auth/staffCapabilities';
import { CatalogDuplicateMergePanel } from '@/components/features/inventory/CatalogDuplicateMergePanel';
import { OFFLINE_MUTATION_KIND } from '@/lib/offline/types';
import { patchJsonOrQueue } from '@/lib/offline/mutationClient';
import { createClientMutationId } from '@/lib/offline/queue';
import { InventoryCatalogPagination } from '@/components/features/inventory/InventoryCatalogPagination';
import { INVENTORY_CATALOG_PAGE_SIZE } from '@/lib/domains/inventory/levelsList';
import {
  fetchInventoryLevelsAll,
  fetchInventoryLevelsPage,
} from '@/lib/domains/inventory/fetchInventoryLevelsPage';

export function AdminInventoryWorkspace({
  levels: initialLevels,
}: {
  levels: StockLevel[] | null;
}) {
  const loading = initialLevels === null;
  const pageSize = INVENTORY_CATALOG_PAGE_SIZE;
  const initialCatalogRef = useRef(initialLevels);
  const preferLocalSliceRef = useRef(
    Boolean(initialLevels && initialLevels.length > pageSize)
  );
  const [catalogOffset, setCatalogOffset] = useState(0);
  const [catalogTotal, setCatalogTotal] = useState(() => initialLevels?.length ?? 0);
  const [catalogPageLoading, setCatalogPageLoading] = useState(false);
  const [levels, setLevels] = useState<StockLevel[]>(() => {
    if (!initialLevels) return [];
    if (initialLevels.length <= pageSize) return initialLevels;
    return initialLevels.slice(0, pageSize);
  });
  const [filters, setFilters] = useState<InventoryFilters>(EMPTY_INVENTORY_FILTERS);
  const [groupBy, setGroupBy] = useState<InventoryGroupBy>('department');
  const [modalRow, setModalRow] = useState<StockLevel | null>(null);
  const [levelsRefreshError, setLevelsRefreshError] = useState<string | null>(null);
  const [fullCatalog, setFullCatalog] = useState<StockLevel[] | null>(() => initialLevels ?? null);
  const fullCatalogLoadingRef = useRef(false);

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
    initialCatalogRef.current = initialLevels;
    setCatalogTotal(initialLevels.length);
    preferLocalSliceRef.current = initialLevels.length > pageSize;
    setCatalogOffset(0);
    setFullCatalog(initialLevels);
    if (initialLevels.length <= pageSize) {
      setLevels(initialLevels);
    } else {
      setLevels(initialLevels.slice(0, pageSize));
    }
  }, [initialLevels, pageSize]);

  const filtersActive = useMemo(() => !inventoryFiltersAreDefault(filters), [filters]);

  const ensureFullCatalog = useCallback(async (): Promise<StockLevel[]> => {
    if (fullCatalog && fullCatalog.length > 0) return fullCatalog;
    const cached = initialCatalogRef.current;
    if (cached && cached.length > 0) {
      setFullCatalog(cached);
      return cached;
    }
    if (fullCatalogLoadingRef.current) return fullCatalog ?? [];
    fullCatalogLoadingRef.current = true;
    try {
      const rows = await fetchInventoryLevelsAll();
      setFullCatalog(rows);
      initialCatalogRef.current = rows;
      setCatalogTotal(rows.length);
      return rows;
    } finally {
      fullCatalogLoadingRef.current = false;
    }
  }, [fullCatalog]);

  const loadCatalogPage = useCallback(
    async (offset: number, { useLocalSlice = false }: { useLocalSlice?: boolean } = {}) => {
      const full = initialCatalogRef.current;
      if (useLocalSlice && full && full.length > pageSize) {
        setCatalogTotal(full.length);
        setLevels(full.slice(offset, offset + pageSize));
        setCatalogOffset(offset);
        return;
      }
      preferLocalSliceRef.current = false;
      setCatalogPageLoading(true);
      try {
        const page = await fetchInventoryLevelsPage(pageSize, offset);
        setLevelsRefreshError(null);
        setLevels(page.levels);
        setCatalogTotal(page.total);
        setCatalogOffset(page.offset);
      } catch (err: unknown) {
        setLevelsRefreshError(
          err instanceof Error ? err.message : 'Network error — catalog may be out of date.'
        );
        console.error('[freshloop] AdminInventoryWorkspace paginated fetch', err);
      } finally {
        setCatalogPageLoading(false);
      }
    },
    [pageSize]
  );

  const prevFiltersActiveRef = useRef(filtersActive);

  useEffect(() => {
    if (!filtersActive) {
      if (prevFiltersActiveRef.current) {
        setCatalogOffset(0);
        void loadCatalogPage(0, { useLocalSlice: preferLocalSliceRef.current });
      }
      prevFiltersActiveRef.current = false;
      return;
    }
    prevFiltersActiveRef.current = true;
    let cancelled = false;
    void (async () => {
      const rows = await ensureFullCatalog();
      if (cancelled) return;
      const filtered = applyInventoryFilters(
        [...rows].sort((a, b) => a.name.localeCompare(b.name)),
        filters
      );
      setCatalogTotal(filtered.length);
      setCatalogOffset(0);
      setLevels(filtered.slice(0, pageSize));
    })();
    return () => {
      cancelled = true;
    };
  }, [filters, filtersActive, ensureFullCatalog, loadCatalogPage, pageSize]);

  const handleCatalogPageChange = useCallback(
    (nextOffset: number) => {
      if (filtersActive) {
        void ensureFullCatalog().then((rows) => {
          const filtered = applyInventoryFilters(
            [...rows].sort((a, b) => a.name.localeCompare(b.name)),
            filters
          );
          setCatalogTotal(filtered.length);
          setCatalogOffset(nextOffset);
          setLevels(filtered.slice(nextOffset, nextOffset + pageSize));
        });
        return;
      }
      void loadCatalogPage(nextOffset, { useLocalSlice: preferLocalSliceRef.current });
    },
    [filters, filtersActive, ensureFullCatalog, loadCatalogPage, pageSize]
  );

  useEffect(() => {
    const refreshLevelsFromApi = () => {
      if (filtersActive) {
        void fetchInventoryLevelsAll()
          .then((rows) => {
            setFullCatalog(rows);
            initialCatalogRef.current = rows;
            preferLocalSliceRef.current = rows.length > pageSize;
            const filtered = applyInventoryFilters(
              [...rows].sort((a, b) => a.name.localeCompare(b.name)),
              filters
            );
            const safeOffset = Math.min(catalogOffset, Math.max(0, filtered.length - pageSize));
            const offset = filtered.length === 0 ? 0 : safeOffset;
            setCatalogTotal(filtered.length);
            setCatalogOffset(offset);
            setLevels(filtered.slice(offset, offset + pageSize));
            setLevelsRefreshError(null);
          })
          .catch((err: unknown) => {
            setLevelsRefreshError(
              err instanceof Error ? err.message : 'Network error — catalog may be out of date.'
            );
          });
        return;
      }
      void loadCatalogPage(catalogOffset);
    };

    const refreshLevels = (detail?: InventoryUpdatedDetail) => {
      if (detail?.source === 'level-patch' && detail.level) {
        setLevels((current) =>
          current.map((row) => (row.productId === detail.level!.productId ? detail.level! : row))
        );
        return;
      }
      refreshLevelsFromApi();
    };
    return subscribeInventoryUpdated(refreshLevels);
  }, [catalogOffset, filters, filtersActive, loadCatalogPage, pageSize]);

  const catalog = useMemo(
    () => [...levels].sort((a, b) => a.name.localeCompare(b.name)),
    [levels]
  );

  const filterSource = useMemo(() => {
    const full = fullCatalog ?? initialCatalogRef.current;
    if (full && full.length > 0) return full;
    return catalog;
  }, [fullCatalog, catalog]);

  const filterOptions = useMemo(() => uniqueFilterOptions(filterSource), [filterSource]);
  const filtered = useMemo(() => applyInventoryFilters(catalog, filters), [catalog, filters]);
  const filteredTotal = useMemo(() => {
    if (!filtersActive) return catalogTotal;
    const full = fullCatalog ?? initialCatalogRef.current ?? catalog;
    return applyInventoryFilters(
      [...full].sort((a, b) => a.name.localeCompare(b.name)),
      filters
    ).length;
  }, [filters, filtersActive, fullCatalog, catalog, catalogTotal]);
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
          onMerged={async () => {
            preferLocalSliceRef.current = false;
            try {
              const rows = await fetchInventoryLevelsAll();
              setFullCatalog(rows);
              initialCatalogRef.current = rows;
              setLevelsRefreshError(null);
              if (filtersActive) {
                const filtered = applyInventoryFilters(
                  [...rows].sort((a, b) => a.name.localeCompare(b.name)),
                  filters
                );
                const offset = Math.min(catalogOffset, Math.max(0, filtered.length - pageSize));
                setCatalogTotal(filtered.length);
                setCatalogOffset(offset);
                setLevels(filtered.slice(offset, offset + pageSize));
              } else {
                setCatalogTotal(rows.length);
                void loadCatalogPage(catalogOffset);
              }
            } catch (err: unknown) {
              setLevelsRefreshError(
                err instanceof Error ? err.message : 'Could not refresh catalog after merge.'
              );
            }
          }}
        />
      ) : null}

      <InventoryFilterBar
        filters={filters}
        onChange={setFilters}
        groupBy={groupBy}
        onGroupBy={setGroupBy}
        options={filterOptions}
        resultCount={filtersActive ? filteredTotal : catalogTotal}
        onReset={() => setGroupBy('department')}
      />

      <InventoryCatalogPagination
        offset={catalogOffset}
        pageSize={pageSize}
        total={catalogTotal}
        loading={loading || catalogPageLoading}
        onPageChange={handleCatalogPageChange}
      />

      <InventoryDataGrid
        groups={groups}
        loading={loading || catalogPageLoading}
        onSelect={setModalRow}
      />

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
