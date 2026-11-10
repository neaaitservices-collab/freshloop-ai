'use client';

import { LiveSubInventoryTransfers } from '@/components/features/inventory/LiveSubInventoryTransfers';
import type { StockLevel } from '@/lib/domains/inventory/stock';

/** Operations page: floor + prep live transfers (same tap-to-modal UI as Production). */
export function OperationsLiveTransfers({
  pullDays,
  initialLevels,
}: {
  pullDays: number;
  initialLevels: StockLevel[] | null;
}) {
  return (
    <LiveSubInventoryTransfers
      pullDays={pullDays}
      initialLevels={initialLevels}
      defaultTab="retail_floor"
      title="Live floor & production transfers"
      description="Tap a SKU to send to production or log waste. Moves write to the inventory ledger immediately."
      showClerkFloorLink
    />
  );
}
