'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRole } from '@/components/auth/RoleProvider';
import { ClerkStockView } from '@/components/features/inventory/ClerkStockView';
import { StoredInventory } from '@/components/features/inventory/StoredInventory';
import type { PullSensitivityDays } from '@/lib/domains/inventory/pullSensitivity';
import type { StockLevel } from '@/lib/domains/inventory/stock';

function InventoryRouteInner({
  levels,
  storePullDays,
}: {
  levels: StockLevel[] | null;
  storePullDays: PullSensitivityDays;
}) {
  const { activeUser, loading } = useRole();
  const searchParams = useSearchParams();
  const highlight = searchParams.get('highlight');

  if (loading && !activeUser) {
    return (
      <StoredInventory
        levels={levels}
        highlightProductId={highlight}
        storePullDays={storePullDays}
      />
    );
  }

  if (activeUser?.role === 'RECEIVING_CLERK') {
    return <ClerkStockView levels={levels} highlightProductId={highlight} />;
  }

  return (
    <StoredInventory levels={levels} highlightProductId={highlight} storePullDays={storePullDays} />
  );
}

export function InventoryRoute({
  levels,
  storePullDays,
}: {
  levels: StockLevel[] | null;
  storePullDays: PullSensitivityDays;
}) {
  return (
    <Suspense fallback={<StoredInventory levels={levels} storePullDays={storePullDays} />}>
      <InventoryRouteInner levels={levels} storePullDays={storePullDays} />
    </Suspense>
  );
}
