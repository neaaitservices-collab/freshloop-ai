import { cache, Suspense } from 'react';
import { BuyList } from '@/components/features/orders/BuyList';
import { getBuyListLevelsWithForecast } from '@/lib/domains/inventory/forecasting';

export const dynamic = 'force-dynamic';

const loadOrdersBuyList = cache(() => getBuyListLevelsWithForecast());

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
