import { ProductionDashboard } from '@/components/features/production/ProductionDashboard';
import { guardFreshPage } from '@/lib/auth/pageGuard';

export const dynamic = 'force-dynamic';

export default async function ProductionPage() {
  await guardFreshPage('/production');
  return <ProductionDashboard />;
}
