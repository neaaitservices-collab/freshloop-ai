import { Suspense } from 'react';
import { ExecutiveDashboard } from '@/components/features/executive/ExecutiveDashboard';
import { ExecutiveDashboardShell } from '@/components/features/executive/ExecutiveDashboardShell';
import { ExecutiveDashboardSkeleton } from '@/components/features/executive/ExecutiveDashboard';
import { getAdminStoreStatsBundle } from '@/lib/domains/stats/storeStats';

export const dynamic = 'force-dynamic';

async function LiveExecutiveDashboard() {
  const { stats, wasteKpi } = await getAdminStoreStatsBundle();
  return <ExecutiveDashboard initialStats={stats} initialWasteKpi={wasteKpi} />;
}

export default function ExecutiveAnalyticsPage() {
  return (
    <ExecutiveDashboardShell>
      <Suspense fallback={<ExecutiveDashboardSkeleton />}>
        <LiveExecutiveDashboard />
      </Suspense>
    </ExecutiveDashboardShell>
  );
}
