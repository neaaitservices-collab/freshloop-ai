'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRole } from '@/components/auth/RoleProvider';
import { SubInventoryWorkspace } from '@/components/features/inventory/SubInventoryWorkspace';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Toast } from '@/components/ui/Toast';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import { useOptimisticInventoryLevels } from '@/hooks/use-optimistic-inventory-levels';
import { useStorePullSensitivityDays } from '@/hooks/use-store-pull-sensitivity-days';

export function KitchenSubInventoryPanel() {
  const { activeUser } = useRole();
  const {
    pullDays,
    failed: pullFailed,
    retry: retryPull,
  } = useStorePullSensitivityDays();
  const { levels, setLevels, performMove } = useOptimisticInventoryLevels(null);
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
  }, [setLevels]);

  useEffect(() => {
    void load();
    const onUpdate = () => void load();
    window.addEventListener('freshloop-inventory-updated', onUpdate);
    return () => window.removeEventListener('freshloop-inventory-updated', onUpdate);
  }, [load]);

  const patchLevel = (level: StockLevel) => {
    setLevels((current) =>
      current.map((item) => (item.productId === level.productId ? level : item))
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Production sub-inventories</CardTitle>
          <CardDescription>
            Move stock between production prep, retail floor, and scrap — synchronized on the ledger.
          </CardDescription>
        </CardHeader>
        <CardBody className="pt-0">
          {pullDays != null ? (
            <SubInventoryWorkspace
              levels={levels}
              loading={loading}
              pullDays={pullDays}
              staffId={activeUser?.id}
              retailPriorityOnly={false}
              showRetailCatalog={false}
              performMove={performMove}
              onSuccess={(message, level) => {
                patchLevel(level);
                setToast(message);
                setError(null);
              }}
              onError={(message) => setError(message)}
            />
          ) : (
            <p className="text-sm text-slate-400">
              {pullFailed ? 'Pull window unavailable.' : 'Loading pull window…'}
              {pullFailed ? (
                <button
                  type="button"
                  onClick={retryPull}
                  className="ml-2 font-bold text-emerald-300 underline-offset-2 hover:underline"
                >
                  Retry
                </button>
              ) : null}
            </p>
          )}
          {error ? (
            <p className="mt-3 rounded-xl border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-xs font-semibold text-rose-200">
              {error}
            </p>
          ) : null}
        </CardBody>
      </Card>
      <Toast message={toast} onDismiss={() => setToast(null)} variant="success" />
    </>
  );
}
