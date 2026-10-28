import { Suspense } from 'react';
import { FloorTransferPage } from '@/components/features/inventory/FloorTransferPage';
import { getStockLevels } from '@/lib/domains/inventory/stock';

export const dynamic = 'force-dynamic';

async function LiveFloor() {
  const levels = await getStockLevels();
  return <FloorTransferPage levels={levels} />;
}

export default function InventoryFloorPage() {
  return (
    <Suspense fallback={<FloorTransferPage levels={null} />}>
      <LiveFloor />
    </Suspense>
  );
}
