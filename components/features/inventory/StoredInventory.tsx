'use client';

import React from 'react';
import { PageMain } from '@/components/ui/layout';
import { SlateInventory } from '@/components/features/inventory/SlateInventory';
import type { PullSensitivityDays } from '@/lib/domains/inventory/pullSensitivity';
import type { StockLevel } from '@/lib/domains/inventory/stock';

export function StoredInventory({
  levels,
  highlightProductId,
  storePullDays,
}: {
  levels: StockLevel[] | null;
  highlightProductId?: string | null;
  storePullDays: PullSensitivityDays;
}) {
  return (
    <PageMain className="bg-slate-950">
      <SlateInventory
        levels={levels}
        highlightProductId={highlightProductId}
        storePullDays={storePullDays}
      />
    </PageMain>
  );
}
