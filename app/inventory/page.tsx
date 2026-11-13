import { Suspense } from 'react';
import { InventoryRoute } from '@/components/features/inventory/InventoryRoute';
import { CaseBoard } from '@/components/features/inventory/CaseBoard';
import { FreshSessionSync } from '@/components/auth/FreshSessionSync';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { getStockLevels } from '@/lib/domains/inventory/stock';
import { isManager } from '@/lib/utils/roles';

export const dynamic = 'force-dynamic';

async function LiveInventory() {
  const user = await guardFreshPage('/inventory');
  const levels = await getStockLevels();
  if (isManager(user.role)) {
    return <CaseBoard levels={levels} showReceipt />;
  }
  return <InventoryRoute levels={levels} />;
}

export default async function InventoryPage() {
  const user = await guardFreshPage('/inventory');
  return (
    <>
      <FreshSessionSync user={user} />
      <Suspense
        fallback={
          isManager(user.role) ? <CaseBoard levels={null} showReceipt /> : <InventoryRoute levels={null} />
        }
      >
        <LiveInventory />
      </Suspense>
    </>
  );
}
