import { Suspense } from 'react';
import { requireManagerStaff } from '@/lib/auth/guardRoute';
import { FreshSessionSync } from '@/components/auth/FreshSessionSync';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { AccountPage } from '@/components/features/admin/AccountPage';
import { StoreSettingsEntryCard } from '@/components/features/admin/StoreSettingsEntryCard';
import { CaseBoard } from '@/components/features/inventory/CaseBoard';
import { DashboardFigures, DashboardFiguresSkeleton } from '@/components/features/admin/DashboardFigures';
import { getStockLevelsRsc } from '@/lib/domains/serverDataCache';
import { adminDashboardWindowIgnoringQuery } from '@/lib/domains/stats/adminDashboardWindow';
import { getAdminStoreStatsBundle } from '@/lib/domains/stats/storeStats';

export const dynamic = 'force-dynamic';

function oneParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

async function LiveFigures({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await guardFreshPage('/admin');
  const raw = await searchParams;
  const dashboardWindow = adminDashboardWindowIgnoringQuery({
    preset: oneParam(raw.preset),
    from: oneParam(raw.from),
    to: oneParam(raw.to),
  });
  const { stats, wasteKpi } = await getAdminStoreStatsBundle(dashboardWindow.range);
  return <DashboardFigures stats={stats} initialWasteKpi={wasteKpi} />;
}

async function LiveCases() {
  await guardFreshPage('/admin');
  const levels = await getStockLevelsRsc();
  return <CaseBoard levels={levels} showReceipt />;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await guardFreshPage('/admin');
  await requireManagerStaff();
  return (
    <>
      <FreshSessionSync user={user} />
      <AccountPage
      settings={<StoreSettingsEntryCard />}
      figures={
        <Suspense fallback={<DashboardFiguresSkeleton />}>
          <LiveFigures searchParams={searchParams} />
        </Suspense>
      }
    >
      <Suspense fallback={<CaseBoard levels={null} showReceipt />}>
        <LiveCases />
      </Suspense>
    </AccountPage>
    </>
  );
}
