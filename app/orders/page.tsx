import { Suspense } from 'react';
import { BuyList } from '@/components/orders/BuyList';
import { AppShell } from '@/components/shell/AppShell';
import { getStockLevels } from '@/lib/stock';

export const dynamic = 'force-dynamic';

async function LiveOrders() {
  const levels = await getStockLevels();
  return <BuyList levels={levels} />;
}

export default function OrdersPage() {
  return (
    <AppShell>
      <Suspense fallback={<BuyList levels={null} />}>
        <LiveOrders />
      </Suspense>
    </AppShell>
  );
}
