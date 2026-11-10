import OperationsCenter from '@/components/features/operations/OperationsCenter';
import { guardFreshPage } from '@/lib/auth/pageGuard';

export const dynamic = 'force-dynamic';

export default async function OperationsPage() {
  await guardFreshPage('/operations');
  return <OperationsCenter />;
}
