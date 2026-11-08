import { Suspense } from 'react';
import { FloorTransferPage } from '@/components/features/inventory/FloorTransferPage';
import { FreshSessionSync } from '@/components/auth/FreshSessionSync';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { getStockLevels } from '@/lib/domains/inventory/stock';

export const dynamic = 'force-dynamic';

async function LiveFloor() {
  await guardFreshPage('/inventory/floor');
  const levels = await getStockLevels();
  return <FloorTransferPage levels={levels} />;
}

export default async function InventoryFloorPage() {
  const user = await guardFreshPage('/inventory/floor');
  return (
    <>
      <FreshSessionSync user={user} />
      <Suspense fallback={<FloorTransferPage levels={null} />}>
        <LiveFloor />
      </Suspense>
    </>
  );
}
