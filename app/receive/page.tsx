import { ReceiveScreen } from '@/components/features/receive/ReceiveScreen';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { loadOpenInvoiceScan } from '@/lib/domains/receiving/openInvoiceScanStore';
import { listReceivingDeliveryLogs } from '@/lib/domains/receiving/receivingDeliveries';

export const dynamic = 'force-dynamic';

export default async function ReceivePage() {
  const actor = await guardFreshPage('/receive');
  const initial = await listReceivingDeliveryLogs();
  const openScan = await loadOpenInvoiceScan(actor.id);
  return <ReceiveScreen initial={initial} openScan={openScan} />;
}
