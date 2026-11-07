'use client';

import React from 'react';
import { LiveSubInventoryTransfers } from '@/components/features/inventory/LiveSubInventoryTransfers';
import type { ProductionFloorRailProps } from '@/components/features/production/productionDashboardTypes';
import { cn } from '@/lib/utils/cn';

export type ProductionFloorTransfersSectionProps = ProductionFloorRailProps & {
  className?: string;
};

export function ProductionFloorTransfersSection({
  pullDays,
  initialLevels,
  mobileFillViewport,
  className,
}: ProductionFloorTransfersSectionProps) {
  return (
    <section
      className={cn('relative z-0 min-w-0 overflow-hidden', className)}
      aria-label="Live floor and prep transfers"
    >
      <LiveSubInventoryTransfers
        pullDays={pullDays}
        initialLevels={initialLevels}
        defaultTab="kitchen_prep"
        title="Live floor & prep transfers"
        description="Tap a SKU to transfer or log waste."
        showClerkFloorLink
        mobileFillViewport={mobileFillViewport}
      />
    </section>
  );
}
