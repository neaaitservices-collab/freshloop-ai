import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { InventoryRoute } from '@/components/features/inventory/InventoryRoute';
import { AuthError, getSessionUser } from '@/lib/auth/session';
import { getStockLevels } from '@/lib/domains/inventory/stock';
import { isManager } from '@/lib/utils/roles';

export const dynamic = 'force-dynamic';

async function LiveInventory() {
  const levels = await getStockLevels();
  return <InventoryRoute levels={levels} />;
}

export default async function InventoryPage() {
  try {
    const user = await getSessionUser();
    if (user && isManager(user.role)) {
      redirect('/admin#inventory-catalog');
    }
  } catch (error) {
    if (error instanceof AuthError) redirect('/login?callbackUrl=%2Finventory');
    throw error;
  }

  return (
    <Suspense fallback={<InventoryRoute levels={null} />}>
      <LiveInventory />
    </Suspense>
  );
}
