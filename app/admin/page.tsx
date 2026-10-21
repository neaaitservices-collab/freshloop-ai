import { Suspense } from 'react';
import { AccountPage } from '@/components/admin/AccountPage';
import { CaseBoard } from '@/components/inventory/CaseBoard';
import { DashboardFigures } from '@/components/today/DashboardFigures';
import { getPlatformSettings } from '@/lib/platformSettings';
import { getStockLevels } from '@/lib/stock';
import { getStoreStats } from '@/lib/storeStats';

export const dynamic = 'force-dynamic';

async function LiveAccount() {
  const [settings, levels, stats] = await Promise.all([
    getPlatformSettings(),
    getStockLevels(),
    getStoreStats(),
  ]);
  return (
    <AccountPage settings={settings} figures={<DashboardFigures stats={stats} />}>
      <CaseBoard levels={levels} showReceipt />
    </AccountPage>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<AccountPage settings={null} figures={<DashboardFigures stats={null} />} />}>
      <LiveAccount />
    </Suspense>
  );
}
