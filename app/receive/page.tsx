import { ReceiveScreen } from '@/components/features/receive/ReceiveScreen';
import { loadReceivingLogs } from '@/lib/domains/receiving/receivingSheet';

export const dynamic = 'force-dynamic';

export default async function ReceivePage() {
  const initial = await loadReceivingLogs();
  return <ReceiveScreen initial={initial} />;
}
