'use client';

import React from 'react';
import type { ReceivingLog } from '@/lib/domains/receiving/yieldPricing';
import { formatCurrency } from '@/lib/domains/receiving/yieldPricing';
import { ReadOnlyStat, SectionCard } from '@/components/ui/YieldFields';

export function ReceivingDetails({ log }: { log: ReceivingLog }) {
  return (
    <SectionCard step="1" title="Receiving" hint="Locked from the sheet">
      <div className="grid grid-cols-3 gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
        <ReadOnlyStat label="Item" value={log.itemName} />
        <ReadOnlyStat label="Cases" value={String(log.casesReceived)} />
        <ReadOnlyStat label="Case cost" value={formatCurrency(log.caseCost)} />
      </div>
    </SectionCard>
  );
}
