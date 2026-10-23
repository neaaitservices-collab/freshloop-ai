import { Suspense } from 'react';
import { AccountPage, SettingsForm } from '@/components/admin/AccountPage';
import { CaseBoard } from '@/components/inventory/CaseBoard';
import { DashboardFigures } from '@/components/today/DashboardFigures';
import { getPlatformSettings } from '@/lib/platformSettings';
import { getStockLevels } from '@/lib/stock';
import { getStoreStats } from '@/lib/storeStats';

export const dynamic = 'force-dynamic';

async function LiveSettings() {
  const settings = await getPlatformSettings();
  return <SettingsForm settings={settings} />;
}

async function LiveFigures() {
  const stats = await getStoreStats();
  return <DashboardFigures stats={stats} />;
}

async function LiveCases() {
  const levels = await getStockLevels();
  return <CaseBoard levels={levels} showReceipt />;
}

export default function AdminPage() {
  return (
    <AccountPage
      settings={
        <Suspense fallback={<SettingsForm settings={null} />}>
          <LiveSettings />
        </Suspense>
      }
      figures={
        <Suspense fallback={<DashboardFigures stats={null} />}>
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
