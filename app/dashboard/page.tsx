import { Suspense } from 'react';
import { DashboardFigures } from '@/components/today/DashboardFigures';
import { TodayHome } from '@/components/today/TodayHome';
import { getStoreStats } from '@/lib/storeStats';

export const dynamic = 'force-dynamic';

async function LiveFigures() {
  const stats = await getStoreStats();
  return <DashboardFigures stats={stats} />;
}

export default function DashboardPage() {
  return (
    <TodayHome
      figures={
        <Suspense fallback={<DashboardFigures stats={null} />}>
          <LiveFigures />
        </Suspense>
      }
    />
  );
}
