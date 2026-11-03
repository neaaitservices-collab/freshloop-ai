'use client';

import { LiveSubInventoryTransfers } from '@/components/features/inventory/LiveSubInventoryTransfers';

/** Operations page: floor + prep live transfers (same tap-to-modal UI as Production). */
export function OperationsLiveTransfers({ pullDays }: { pullDays: number }) {
  return (
    <LiveSubInventoryTransfers
      pullDays={pullDays}
      defaultTab="retail_floor"
      title="Live floor & production transfers"
      description="Tap a SKU to send to production or log waste. Moves write to the inventory ledger immediately."
      showClerkFloorLink
    />
  );
}
