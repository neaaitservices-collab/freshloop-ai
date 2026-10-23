'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRole } from '@/components/auth/RoleProvider';
import { SubInventoryWorkspace } from '@/components/features/inventory/SubInventoryWorkspace';
import type { StockLevel } from '@/lib/domains/inventory/stock';

export function KitchenSubInventoryPanel() {
  const { activeUser } = useRole();
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory/levels', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.levels)) {
        setLevels(json.levels as StockLevel[]);
      }
    } catch {
      setError('Could not load sub-inventories.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onUpdate = () => void load();
    window.addEventListener('freshloop-inventory-updated', onUpdate);
    return () => window.removeEventListener('freshloop-inventory-updated', onUpdate);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const patchLevel = (level: StockLevel) => {
    setLevels((current) =>
      current.map((item) => (item.productId === level.productId ? level : item))
    );
  };

  return (
    <section className="space-y-3">
      <SubInventoryWorkspace
        levels={levels}
        loading={loading}
        staffId={activeUser?.id}
        retailPriorityOnly={false}
        showRetailCatalog={false}
        onSuccess={(message, level) => {
          patchLevel(level);
          setToast(message);
          setError(null);
        }}
        onError={(message) => setError(message)}
      />
      {error ? <p className="text-sm font-semibold text-rose-300">{error}</p> : null}
      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-2xl border border-zinc-700 bg-zinc-900/95 px-4 py-3 text-sm font-bold text-slate-100 shadow-xl md:bottom-8">
          {toast}
        </div>
      ) : null}
    </section>
  );
}
