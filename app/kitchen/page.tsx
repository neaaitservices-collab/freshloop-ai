import { redirect } from 'next/navigation';
import { guardFreshPage } from '@/lib/auth/pageGuard';

export const dynamic = 'force-dynamic';

/** @deprecated Use `/production` */
export default async function KitchenLegacyRedirect() {
  await guardFreshPage('/kitchen');
  redirect('/production');
}
