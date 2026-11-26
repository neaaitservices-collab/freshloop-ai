import { ProductionDashboard } from '@/components/features/production/ProductionDashboard';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { normalizePullSensitivityDays } from '@/lib/domains/inventory/pullSensitivity';
import { getPlatformSettings } from '@/lib/domains/stats/platformSettings';

export const dynamic = 'force-dynamic';

export default async function ProductionPage() {
  await guardFreshPage('/production');
  const storePullDays = normalizePullSensitivityDays(
    (await getPlatformSettings()).pullSensitivityDays
  );
  return <ProductionDashboard storePullDays={storePullDays} />;
}
