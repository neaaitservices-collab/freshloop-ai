import { cache, Suspense } from 'react';
import { BuyList } from '@/components/features/orders/BuyList';
import { getBuyListLevelsRsc } from '@/lib/domains/serverDataCache';

export const dynamic = 'force-dynamic';

const loadOrdersBuyList = cache(() => getBuyListLevelsRsc());

async function LiveOrders() {
  const levels = await loadOrdersBuyList();
  return <BuyList levels={levels} />;
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<BuyList levels={null} />}>
      <LiveOrders />
    </Suspense>
  );
}
