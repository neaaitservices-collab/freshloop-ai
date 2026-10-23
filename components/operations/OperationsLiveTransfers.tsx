'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { useRole } from '@/components/auth/RoleProvider';
import { SubInventoryWorkspace } from '@/components/inventory/SubInventoryWorkspace';
import type { StockLevel } from '@/lib/stock';

/** Same transfer UI as `/inventory`, wired to the live ledger (not mock ledger rows). */
export function OperationsLiveTransfers({
  pullDays,
  onLedgerRefresh,
}: {
  pullDays: number;
  onLedgerRefresh: () => void;
}) {
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
      setError('Live stock levels could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onUpdate = () => {
      void load();
      onLedgerRefresh();
    };
    window.addEventListener('freshloop-inventory-updated', onUpdate);
    return () => window.removeEventListener('freshloop-inventory-updated', onUpdate);
  }, [load, onLedgerRefresh]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-black text-white">Live sub-inventory transfers</h3>
          <p className="text-[11px] text-zinc-400">
            Same controls as Inventory — writes real{' '}
            <code className="text-zinc-300">Inventory_Transactions</code> (tables below are read-only
            analytics).
          </p>
        </div>
        <Link
          href="/inventory/floor"
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-[11px] font-bold text-emerald-300"
        >
          Clerk floor view
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <SubInventoryWorkspace
        levels={levels}
        loading={loading}
        pullDays={pullDays}
        staffId={activeUser?.id ?? 'staff-operations'}
        retailPriorityOnly={false}
        showRetailCatalog={false}
        onSuccess={(message, level) => {
          setLevels((current) =>
            current.map((row) => (row.productId === level.productId ? level : row))
          );
          setToast(message);
          setError(null);
          onLedgerRefresh();
        }}
        onError={(message) => setError(message)}
      />

      {error ? <p className="text-xs font-semibold text-rose-300">{error}</p> : null}
      {toast ? (
        <p className="text-xs font-bold text-emerald-300">{toast}</p>
      ) : null}
    </div>
  );
}
