import { Suspense } from 'react';
import { StoredInventory } from '@/components/features/inventory/StoredInventory';
import { AppShell } from '@/components/layout/AppShell';
import { getStockLevels } from '@/lib/domains/inventory/stock';

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
