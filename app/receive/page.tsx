import { ReceiveScreen } from '@/components/receive/ReceiveScreen';
import { loadReceivingLogs } from '@/lib/receivingSheet';

export const dynamic = 'force-dynamic';

export default async function ReceivePage() {
  const initial = await loadReceivingLogs();
  return <ReceiveScreen initial={initial} />;
}
