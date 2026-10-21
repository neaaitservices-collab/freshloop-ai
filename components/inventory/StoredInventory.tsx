'use client';

import React from 'react';
import { SlateInventory } from '@/components/inventory/SlateInventory';
import type { StockLevel } from '@/lib/stock';

export function StoredInventory({ levels }: { levels: StockLevel[] | null }) {
  return (
    <main className="mx-auto w-full max-w-7xl bg-slate-950 px-3 py-5 pb-28 sm:px-6 sm:py-8">
      <SlateInventory levels={levels} />
    </main>
  );
}
