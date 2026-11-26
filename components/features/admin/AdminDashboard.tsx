'use client';

import { AdminStatsCard } from '@/components/features/admin/AdminStats';
import type { StoreStats } from '@/lib/domains/stats/storeStatsTypes';
import type { WasteKpiReport } from '@/lib/domains/inventory/ledger';

export function AdminDashboard({
  stats,
  wasteKpi,
  wasteRangeId = null,
  inventoryValue = null,
  refreshing = false,
  className,
}: {
  stats: StoreStats | null;
  wasteKpi: WasteKpiReport | null;
  /** Range id that `wasteKpi` was loaded for. */
  wasteRangeId?: string | null;
  /** Live on-hand dollars. Independent of the date range. */
  inventoryValue?: number | null;
  refreshing?: boolean;
  className?: string;
}) {
  return (
    <div className={className} aria-label="Admin dashboard" aria-busy={refreshing || undefined}>
      <AdminStatsCard
        stats={stats}
        wasteKpi={wasteKpi}
        wasteRangeId={wasteRangeId}
        inventoryValue={inventoryValue}
      />
    </div>
  );
}
