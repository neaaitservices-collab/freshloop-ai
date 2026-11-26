'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { useStorePullSensitivityDays } from '@/hooks/use-store-pull-sensitivity-days';
import {
  storePullSensitivityDaysSchema,
  type PullSensitivityDays,
} from '@/lib/domains/inventory/pullSensitivity';
import { dispatchSettingsUpdated } from '@/lib/domains/stats/settingsEvents';
import { isManager } from '@/lib/utils/roles';
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
  storePullDays = null,
}: {
  levels: StockLevel[] | null;
  storePullDays?: PullSensitivityDays | null;
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

  const router = useRouter();
  const {
    pullDays,
    ready: pullReady,
    failed: pullFailed,
    retry: retryPull,
  } = useStorePullSensitivityDays(storePullDays);
  const [savingPull, setSavingPull] = useState(false);
  const [pendingPullDays, setPendingPullDays] = useState<PullSensitivityDays | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);
  const { activeUser } = useRole();
  const { role: stableRole } = useStableNavRole();
  const effectiveRole = activeUser?.role ?? stableRole;
  const canOverride = Boolean(
    effectiveRole && canOverrideInventoryStock(effectiveRole)
  );
  const canRemoveFromCatalog = effectiveRole === 'ADMIN';
  const isAdmin = effectiveRole === 'ADMIN';
  const canSetStorePull = effectiveRole != null && isManager(effectiveRole);
  const shownPullDays = pendingPullDays ?? pullDays;

  const saveStorePull = async (days: PullSensitivityDays) => {
    if (savingPull || days === pullDays) return;
    setSavingPull(true);
    setPullError(null);
    setPendingPullDays(days);
    try {
      const read = await fetch('/api/admin/settings', { cache: 'no-store' });
      const current = (await read.json()) as {
        success?: boolean;
        error?: string;
        settings?: Record<string, unknown>;
      };
      if (!read.ok || !current.success || !current.settings) {
        setPullError(current.error || 'Pull window could not be loaded.');
        setPendingPullDays(null);
        return;
      }
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...current.settings, pullSensitivityDays: days }),
      });
      const json = (await response.json()) as {
        success?: boolean;
        error?: string;
        settings?: Parameters<typeof dispatchSettingsUpdated>[0];
      };
      if (!response.ok || !json.success || !json.settings) {
        setPullError(json.error || 'Pull window could not be saved.');
        setPendingPullDays(null);
        return;
      }
      dispatchSettingsUpdated(json.settings);
      setPendingPullDays(null);
      router.refresh();
    } catch {
      setPullError('Pull window could not be saved.');
      setPendingPullDays(null);
    } finally {
      setSavingPull(false);
    }
  };

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
        {canSetStorePull ? (
          <label className="mt-4 block max-w-xs text-xs font-bold text-slate-400">
            Store pull window
            {pullReady && shownPullDays != null ? (
              <select
                id="store-pull-window"
                value={shownPullDays}
                disabled={savingPull}
                aria-busy={savingPull}
                onChange={(event) => {
                  const parsed = storePullSensitivityDaysSchema.safeParse(Number(event.target.value));
                  if (!parsed.success) return;
                  void saveStorePull(parsed.data);
                }}
                className="mt-1 w-full min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 disabled:opacity-60"
              >
                <option value={2}>2 days (strict)</option>
                <option value={3}>3 days (standard)</option>
                <option value={4}>4 days (extended)</option>
              </select>
            ) : (
              <span className="mt-1 block text-sm font-semibold text-slate-500">
                {pullReady ? 'Pull window unavailable.' : 'Loading pull window…'}
                {pullFailed ? (
                  <button
                    type="button"
                    onClick={retryPull}
                    className="ml-2 font-bold text-emerald-300 underline-offset-2 hover:underline"
                  >
                    Retry
                  </button>
                ) : null}
              </span>
            )}
            <span className="mt-1 block text-[11px] font-normal text-slate-500">
              Saved for this store. Clerks see the same window after reload. A per-SKU override still wins.
            </span>
          </label>
        ) : null}
        {pullError ? (
          <p role="alert" className="mt-2 text-sm font-semibold text-rose-300">
            {pullError}
          </p>
        ) : null}
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
        emptyLabel={
          !filtersActive && catalogTotal === 0
            ? 'No catalog SKUs yet. Receive product to add them. Sample items are not listed.'
            : 'No items match these filters. Try reset or receive product on Receive.'
        }
      />

      <ItemSettingsModal
        row={modalRow}
        open={modalRow !== null}
        storePullDays={pullDays}
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
