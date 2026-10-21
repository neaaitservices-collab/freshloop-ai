import { Suspense } from 'react';
import { CaseBoard } from '@/components/inventory/CaseBoard';
import { DashboardFigures } from '@/components/today/DashboardFigures';
import { TodayHome } from '@/components/today/TodayHome';
import { getStockLevels } from '@/lib/stock';
import { getStoreStats } from '@/lib/storeStats';

export const dynamic = 'force-dynamic';

async function LiveFigures() {
  const stats = await getStoreStats();
  return <DashboardFigures stats={stats} />;
}

async function LiveCases() {
  const levels = await getStockLevels();
  return <CaseBoard levels={levels} showReceipt />;
}

export default function DashboardPage() {
  return (
    <TodayHome
      figures={
        <Suspense fallback={<DashboardFigures stats={null} />}>
          <LiveFigures />
        </Suspense>
      }
      cases={
        <Suspense fallback={<CaseBoard levels={null} showReceipt />}>
          <LiveCases />
        </Suspense>
      }
    />
  );
}
