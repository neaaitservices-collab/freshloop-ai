import { Suspense } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { FloorTransferPage } from '@/components/inventory/FloorTransferPage';
import { getStockLevels } from '@/lib/stock';

export const dynamic = 'force-dynamic';

async function LiveFloor() {
  const levels = await getStockLevels();
  return <FloorTransferPage levels={levels} />;
}

export default function InventoryFloorPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <FloorTransferPage levels={null} />
        }
      >
        <LiveFloor />
      </Suspense>
    </AppShell>
  );
}
