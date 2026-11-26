import { Suspense } from 'react';
import { InventoryRoute } from '@/components/features/inventory/InventoryRoute';
import { CaseBoard } from '@/components/features/inventory/CaseBoard';
import { FreshSessionSync } from '@/components/auth/FreshSessionSync';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import {
  normalizePullSensitivityDays,
  type PullSensitivityDays,
} from '@/lib/domains/inventory/pullSensitivity';
import { getStockLevels } from '@/lib/domains/inventory/stock';
import { getPlatformSettings } from '@/lib/domains/stats/platformSettings';
import { isManager } from '@/lib/utils/roles';

export const dynamic = 'force-dynamic';

async function LiveInventory({ storePullDays }: { storePullDays: PullSensitivityDays }) {
  const user = await guardFreshPage('/inventory');
  const levels = await getStockLevels();
  if (isManager(user.role)) {
    return <CaseBoard levels={levels} showReceipt storePullDays={storePullDays} />;
  }
  return <InventoryRoute levels={levels} storePullDays={storePullDays} />;
}

export default async function InventoryPage() {
  const user = await guardFreshPage('/inventory');
  const storePullDays = normalizePullSensitivityDays(
    (await getPlatformSettings()).pullSensitivityDays
  );
  return (
    <>
      <FreshSessionSync user={user} />
      <Suspense
        fallback={
          isManager(user.role) ? (
            <CaseBoard levels={null} showReceipt storePullDays={storePullDays} />
          ) : (
            <InventoryRoute levels={null} storePullDays={storePullDays} />
          )
        }
      >
        <LiveInventory storePullDays={storePullDays} />
      </Suspense>
    </>
  );
}
