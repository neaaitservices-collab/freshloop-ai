import { Suspense } from 'react';
import { InventoryRoute } from '@/components/features/inventory/InventoryRoute';
import { getStockLevels } from '@/lib/domains/inventory/stock';

export const dynamic = 'force-dynamic';

async function LiveInventory() {
  const levels = await getStockLevels();
  return <InventoryRoute levels={levels} />;
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<InventoryRoute levels={null} />}>
      <LiveInventory />
    </Suspense>
  );
}
