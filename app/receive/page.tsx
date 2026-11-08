import { ReceiveScreen } from '@/components/features/receive/ReceiveScreen';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { loadReceivingLogs } from '@/lib/domains/receiving/receivingSheet';

export const dynamic = 'force-dynamic';

export default async function ReceivePage() {
  await guardFreshPage('/receive');
  const initial = await loadReceivingLogs();
  return <ReceiveScreen initial={initial} />;
}
