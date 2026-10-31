'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRole } from '@/components/auth/RoleProvider';
import { SubInventoryWorkspace } from '@/components/features/inventory/SubInventoryWorkspace';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Toast } from '@/components/ui/Toast';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import { useOptimisticInventoryLevels } from '@/hooks/use-optimistic-inventory-levels';

export function KitchenSubInventoryPanel() {
  const { activeUser } = useRole();
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
          <SubInventoryWorkspace
            levels={levels}
            loading={loading}
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
