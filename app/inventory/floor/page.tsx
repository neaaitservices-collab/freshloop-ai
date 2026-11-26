import { Suspense } from 'react';
import { FloorTransferPage } from '@/components/features/inventory/FloorTransferPage';
import { FreshSessionSync } from '@/components/auth/FreshSessionSync';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import {
  normalizePullSensitivityDays,
  type PullSensitivityDays,
} from '@/lib/domains/inventory/pullSensitivity';
import { getStockLevels } from '@/lib/domains/inventory/stock';
import { getPlatformSettings } from '@/lib/domains/stats/platformSettings';

export const dynamic = 'force-dynamic';

async function LiveFloor({ storePullDays }: { storePullDays: PullSensitivityDays }) {
  await guardFreshPage('/inventory/floor');
  const levels = await getStockLevels();
  return <FloorTransferPage levels={levels} storePullDays={storePullDays} />;
}

export default async function InventoryFloorPage() {
  const user = await guardFreshPage('/inventory/floor');
  const storePullDays = normalizePullSensitivityDays(
    (await getPlatformSettings()).pullSensitivityDays
  );
  return (
    <>
      <FreshSessionSync user={user} />
      <Suspense fallback={<FloorTransferPage levels={null} storePullDays={storePullDays} />}>
        <LiveFloor storePullDays={storePullDays} />
      </Suspense>
    </>
  );
}
