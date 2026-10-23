'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRole } from '@/components/auth/RoleProvider';
import { ClerkStockView } from '@/components/features/inventory/ClerkStockView';
import { StoredInventory } from '@/components/features/inventory/StoredInventory';
import type { StockLevel } from '@/lib/domains/inventory/stock';

function InventoryRouteInner({ levels }: { levels: StockLevel[] | null }) {
  const { activeUser, loading } = useRole();
  const searchParams = useSearchParams();
  const highlight = searchParams.get('highlight');

  if (loading && !activeUser) {
    return <StoredInventory levels={levels} highlightProductId={highlight} />;
  }

  if (activeUser?.role === 'RECEIVING_CLERK') {
    return <ClerkStockView levels={levels} highlightProductId={highlight} />;
  }

  return <StoredInventory levels={levels} highlightProductId={highlight} />;
}

export function InventoryRoute({ levels }: { levels: StockLevel[] | null }) {
  return (
    <Suspense fallback={<StoredInventory levels={levels} />}>
      <InventoryRouteInner levels={levels} />
    </Suspense>
  );
}
