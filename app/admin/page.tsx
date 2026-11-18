import { Suspense } from 'react';
import { requireManagerStaff } from '@/lib/auth/guardRoute';
import { FreshSessionSync } from '@/components/auth/FreshSessionSync';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { AdminSectionHeader } from '@/components/features/admin/AdminSectionHeader';
import { CatalogBookmarkRedirect } from '@/components/features/admin/CatalogBookmarkRedirect';
import { DashboardFigures, DashboardFiguresSkeleton } from '@/components/features/admin/DashboardFigures';
import { PageMain } from '@/components/ui/layout';
import { resolveAdminDateSearch } from '@/lib/domains/stats/adminDateRange';
import { getAdminStoreStatsBundle } from '@/lib/domains/stats/storeStats';

export const dynamic = 'force-dynamic';

async function LiveFigures({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await guardFreshPage('/admin');
  const dashboardWindow = resolveAdminDateSearch(await searchParams);
  const { stats, wasteKpi } = await getAdminStoreStatsBundle(dashboardWindow.range);
  return <DashboardFigures stats={stats} initialWasteKpi={wasteKpi} />;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await guardFreshPage('/admin');
  await requireManagerStaff();
  return (
    <PageMain className="py-4 pb-24 sm:py-6">
      <FreshSessionSync user={user} />
      <CatalogBookmarkRedirect />
      <AdminSectionHeader dateFilter />
      <Suspense fallback={<DashboardFiguresSkeleton />}>
        <LiveFigures searchParams={searchParams} />
      </Suspense>
    </PageMain>
  );
}
