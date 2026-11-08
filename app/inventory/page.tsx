import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { InventoryRoute } from '@/components/features/inventory/InventoryRoute';
import { FreshSessionSync } from '@/components/auth/FreshSessionSync';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { getStockLevels } from '@/lib/domains/inventory/stock';
import { isManager } from '@/lib/utils/roles';

export const dynamic = 'force-dynamic';

async function LiveInventory() {
  const user = await guardFreshPage('/inventory');
  if (isManager(user.role)) {
    redirect('/admin#inventory-catalog');
  }
  const levels = await getStockLevels();
  return <InventoryRoute levels={levels} />;
}

export default async function InventoryPage() {
  const user = await guardFreshPage('/inventory');
  if (isManager(user.role)) {
    redirect('/admin#inventory-catalog');
  }
  return (
    <>
      <FreshSessionSync user={user} />
      <Suspense fallback={<InventoryRoute levels={null} />}>
        <LiveInventory />
      </Suspense>
    </>
  );
}
