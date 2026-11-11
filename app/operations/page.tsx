import { permanentRedirect } from 'next/navigation';
import { guardFreshPage } from '@/lib/auth/pageGuard';

export const dynamic = 'force-dynamic';

/** Old Store operations links stay signed-in, then open Production. */
export default async function OperationsPage() {
  await guardFreshPage('/operations');
  permanentRedirect('/production');
}
