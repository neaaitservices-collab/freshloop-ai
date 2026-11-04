'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRole } from '@/components/auth/RoleProvider';
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
import { canOverrideInventoryStock } from '@/lib/auth/staffCapabilities';
import { CatalogDuplicateMergePanel } from '@/components/features/inventory/CatalogDuplicateMergePanel';

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

  const { activeUser, loading: roleLoading } = useRole();
  const [roleReady, setRoleReady] = useState(false);
  useEffect(() => setRoleReady(true), []);
  const canOverride =
    roleReady &&
    !roleLoading &&
    Boolean(activeUser && canOverrideInventoryStock(activeUser.role));
  const canRemoveFromCatalog =
    roleReady && !roleLoading && Boolean(activeUser && activeUser.role === 'ADMIN');
  const isAdmin = roleReady && !roleLoading && activeUser?.role === 'ADMIN';

  useEffect(() => {
    if (!initialLevels) return;
    setLevels(initialLevels);
  }, [initialLevels]);

  useEffect(() => {
    const refreshLevels = () => {
      void fetch('/api/inventory/levels', { cache: 'no-store' })
        .then((res) => res.json())
        .then((json) => {
          if (json.success && Array.isArray(json.levels)) {
            setLevels(json.levels as StockLevel[]);
          }
        })
        .catch(() => {});
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
    <section id="inventory-catalog" className="scroll-mt-24 min-w-0 space-y-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300/90">Inventory catalog</p>
        <h2 className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">Stock & margin control</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Full product catalog from the database. Items stay listed at zero stock. Admins can merge duplicate
          SKUs (same item, different invoice names) or remove a SKU from the catalog.
        </p>
      </div>

      {isAdmin ? (
        <CatalogDuplicateMergePanel
          onMerged={() => {
            void fetch('/api/inventory/levels', { cache: 'no-store' })
              .then((res) => res.json())
              .then((json) => {
                if (json.success && Array.isArray(json.levels)) {
                  setLevels(json.levels as StockLevel[]);
                }
              })
              .catch(() => undefined);
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
          window.dispatchEvent(new CustomEvent('freshloop-inventory-updated'));
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
            }),
          });
          const json = await res.json();
          if (!res.ok || !json.success) throw new Error(json.error || 'Could not save metadata.');
          patchLevel(json.level as StockLevel);
          window.dispatchEvent(new CustomEvent('freshloop-inventory-updated'));
        }}
        onSaveCase={async (payload) => {
          if (!modalRow) return;
          const res = await fetch('/api/inventory/levels', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: modalRow.productId,
              packSize: payload.packSize,
              yieldDivisor: payload.yieldDivisor,
              retailUnit: payload.retailUnit,
              retailPrice: payload.retailPrice,
            }),
          });
          const json = await res.json();
          if (!res.ok || !json.success) throw new Error(json.error || 'Could not save case.');
          patchLevel(json.level as StockLevel);
          window.dispatchEvent(new CustomEvent('freshloop-inventory-updated'));
        }}
        onUpdatePhysicalCount={async (cases) => {
          if (!modalRow) throw new Error('No item selected.');
          const res = await fetch('/api/inventory/levels', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: modalRow.productId,
              casesOnHand: cases,
            }),
          });
          const json = await res.json();
          if (!res.ok || !json.success) throw new Error(json.error || 'Stock could not be updated.');
          patchLevel(json.level as StockLevel);
          window.dispatchEvent(new CustomEvent('freshloop-inventory-updated'));
          return (json.audit as StockOverrideAudit | undefined) ?? null;
        }}
      />
    </section>
  );
}
