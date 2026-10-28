import { Suspense } from 'react';
import { BuyList } from '@/components/features/orders/BuyList';
import { getStockLevels } from '@/lib/domains/inventory/stock';

export const dynamic = 'force-dynamic';

async function LiveOrders() {
  const levels = await getStockLevels();
  return <BuyList levels={levels} />;
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<BuyList levels={null} />}>
      <LiveOrders />
    </Suspense>
  );
}
