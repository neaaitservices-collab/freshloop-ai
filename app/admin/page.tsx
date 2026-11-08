import { Suspense } from 'react';
import { requireManagerStaff } from '@/lib/auth/guardRoute';
import { FreshSessionSync } from '@/components/auth/FreshSessionSync';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { AccountPage } from '@/components/features/admin/AccountPage';
import { StoreSettingsEntryCard } from '@/components/features/admin/StoreSettingsEntryCard';
import { CaseBoard } from '@/components/features/inventory/CaseBoard';
import { DashboardFigures, DashboardFiguresSkeleton } from '@/components/features/admin/DashboardFigures';
import { getStockLevelsRsc } from '@/lib/domains/serverDataCache';
import { getAdminStoreStatsBundle } from '@/lib/domains/stats/storeStats';

export const dynamic = 'force-dynamic';

async function LiveFigures() {
  await guardFreshPage('/admin');
  const { stats, wasteKpi } = await getAdminStoreStatsBundle();
  return <DashboardFigures stats={stats} initialWasteKpi={wasteKpi} />;
}

async function LiveCases() {
  await guardFreshPage('/admin');
  const levels = await getStockLevelsRsc();
  return <CaseBoard levels={levels} showReceipt />;
}

export default async function AdminPage() {
  const user = await guardFreshPage('/admin');
  await requireManagerStaff();
  return (
    <>
      <FreshSessionSync user={user} />
      <AccountPage
      settings={<StoreSettingsEntryCard />}
      figures={
        <Suspense fallback={<DashboardFiguresSkeleton />}>
          <LiveFigures />
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
