import { redirect } from 'next/navigation';
import { guardFreshPage } from '@/lib/auth/pageGuard';

export const dynamic = 'force-dynamic';

/** Direct `/voice` is guarded, then opens Store operations, which redirects to production. */
export default async function VoicePage() {
  await guardFreshPage('/voice');
  redirect('/operations');
}
