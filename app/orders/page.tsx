import { cache, Suspense } from 'react';
import { BuyList } from '@/components/features/orders/BuyList';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { getBuyListLevelsRsc } from '@/lib/domains/serverDataCache';

export const dynamic = 'force-dynamic';

const loadOrdersBuyList = cache(() => getBuyListLevelsRsc());

async function LiveOrders() {
  await guardFreshPage('/orders');
  const levels = await loadOrdersBuyList();
  return <BuyList levels={levels} />;
}

export default async function OrdersPage() {
  await guardFreshPage('/orders');
  return (
    <Suspense fallback={<BuyList levels={null} />}>
      <LiveOrders />
    </Suspense>
  );
}
