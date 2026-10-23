import { Suspense } from 'react';
import { InventoryRoute } from '@/components/features/inventory/InventoryRoute';
import { AppShell } from '@/components/layout/AppShell';
import { getStockLevels } from '@/lib/domains/inventory/stock';

export const dynamic = 'force-dynamic';

async function LiveInventory() {
  const levels = await getStockLevels();
  return <InventoryRoute levels={levels} />;
}

export default function InventoryPage() {
  return (
    <AppShell>
      <Suspense fallback={<InventoryRoute levels={null} />}>
        <LiveInventory />
      </Suspense>
    </AppShell>
  );
}
