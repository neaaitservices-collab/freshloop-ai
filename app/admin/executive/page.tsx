import { Suspense } from 'react';
import { ExecutiveDashboard } from '@/components/features/executive/ExecutiveDashboard';
import { ExecutiveDashboardShell } from '@/components/features/executive/ExecutiveDashboardShell';
import { ExecutiveDashboardSkeleton } from '@/components/features/executive/ExecutiveDashboard';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { resolveAdminDateSearch } from '@/lib/domains/stats/adminDateRange';
import { getAdminStoreStatsBundle } from '@/lib/domains/stats/storeStats';

export const dynamic = 'force-dynamic';

async function LiveExecutiveDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await guardFreshPage('/admin/executive');
  const dashboardWindow = resolveAdminDateSearch(await searchParams);
  const { stats, wasteKpi } = await getAdminStoreStatsBundle(dashboardWindow.range);
  return (
    <ExecutiveDashboard
      initialStats={stats}
      initialWasteKpi={wasteKpi}
      rangeDays={dashboardWindow.dayCount}
    />
  );
}

export default async function ExecutiveAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await guardFreshPage('/admin/executive');
  return (
    <ExecutiveDashboardShell>
      <Suspense fallback={<ExecutiveDashboardSkeleton />}>
        <LiveExecutiveDashboard searchParams={searchParams} />
      </Suspense>
    </ExecutiveDashboardShell>
  );
}
