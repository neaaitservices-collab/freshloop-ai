import { ReceiveScreen } from '@/components/features/receive/ReceiveScreen';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { listReceivingDeliveryLogs } from '@/lib/domains/receiving/receivingDeliveries';

export const dynamic = 'force-dynamic';

export default async function ReceivePage() {
  await guardFreshPage('/receive');
  const initial = await listReceivingDeliveryLogs();
  return <ReceiveScreen initial={initial} />;
}
