import { Suspense } from 'react';
import { StoredInventory } from '@/components/inventory/StoredInventory';
import { AppShell } from '@/components/shell/AppShell';
import { getStockLevels } from '@/lib/stock';

export const dynamic = 'force-dynamic';

async function LiveInventory() {
  const levels = await getStockLevels();
  return <StoredInventory levels={levels} />;
}

export default function InventoryPage() {
  return (
    <AppShell>
      <Suspense fallback={<StoredInventory levels={null} />}>
        <LiveInventory />
      </Suspense>
    </AppShell>
  );
}
