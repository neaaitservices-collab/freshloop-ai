import { Suspense } from 'react';
import { BuyList } from '@/components/features/orders/BuyList';
import { getBuyListLevelsWithForecast } from '@/lib/domains/inventory/forecasting';

export const dynamic = 'force-dynamic';

async function LiveOrders() {
  const levels = await getBuyListLevelsWithForecast();
  return <BuyList levels={levels} />;
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<BuyList levels={null} />}>
      <LiveOrders />
    </Suspense>
  );
}
