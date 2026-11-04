import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { InventoryRoute } from '@/components/features/inventory/InventoryRoute';
import { getStockLevels } from '@/lib/domains/inventory/stock';
import { isManager, isRoleName } from '@/lib/utils/roles';

export const dynamic = 'force-dynamic';

async function LiveInventory() {
  const levels = await getStockLevels();
  return <InventoryRoute levels={levels} />;
}

export default async function InventoryPage() {
  const session = await auth();
  const role = session?.user?.role;
  if (role && isRoleName(role) && isManager(role)) {
    redirect('/admin#inventory-catalog');
  }

  return (
    <Suspense fallback={<InventoryRoute levels={null} />}>
      <LiveInventory />
    </Suspense>
  );
}
