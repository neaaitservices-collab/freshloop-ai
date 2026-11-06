import { Suspense } from 'react';
import { requireManagerStaff } from '@/lib/auth/guardRoute';
import { AccountPage } from '@/components/features/admin/AccountPage';
import { StoreSettingsEntryCard } from '@/components/features/admin/StoreSettingsEntryCard';
import { CaseBoard } from '@/components/features/inventory/CaseBoard';
import { DashboardFigures, DashboardFiguresSkeleton } from '@/components/features/admin/DashboardFigures';
import { getStockLevels } from '@/lib/domains/inventory/stock';
import { getAdminStoreStatsBundle } from '@/lib/domains/stats/storeStats';

export const dynamic = 'force-dynamic';

async function LiveFigures() {
  const { stats, wasteKpi } = await getAdminStoreStatsBundle();
  return <DashboardFigures stats={stats} initialWasteKpi={wasteKpi} />;
}

async function LiveCases() {
  const levels = await getStockLevels();
  return <CaseBoard levels={levels} showReceipt />;
}

export default async function AdminPage() {
  await requireManagerStaff();
  return (
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
  );
}
