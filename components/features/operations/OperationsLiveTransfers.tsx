'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { useRole } from '@/components/auth/RoleProvider';
import { SubInventoryWorkspace } from '@/components/features/inventory/SubInventoryWorkspace';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Toast } from '@/components/ui/Toast';
import type { StockLevel } from '@/lib/domains/inventory/stock';

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

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Live sub-inventory transfers</CardTitle>
            <CardDescription>
              Same controls as Inventory — writes real ledger rows (tables below are read-only).
            </CardDescription>
          </div>
          <Link href="/inventory/floor" className="shrink-0">
            <Button variant="secondary" className="text-[11px]">
              Clerk floor view
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardBody className="pt-0">
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
          {error ? (
            <p className="mt-3 rounded-xl border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-xs font-semibold text-rose-400">
              {error}
            </p>
          ) : null}
        </CardBody>
      </Card>
      <Toast message={toast} onDismiss={() => setToast(null)} variant="success" />
    </>
  );
}
