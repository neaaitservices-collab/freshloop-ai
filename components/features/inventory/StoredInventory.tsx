'use client';

import React from 'react';
import { PageMain } from '@/components/ui/layout';
import { SlateInventory } from '@/components/features/inventory/SlateInventory';
import type { StockLevel } from '@/lib/domains/inventory/stock';

export function StoredInventory({
  levels,
  highlightProductId,
}: {
  levels: StockLevel[] | null;
  highlightProductId?: string | null;
}) {
  return (
    <PageMain className="bg-slate-950">
      <SlateInventory levels={levels} highlightProductId={highlightProductId} />
    </PageMain>
  );
}
