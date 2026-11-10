import { redirect } from 'next/navigation';
import { guardFreshPage } from '@/lib/auth/pageGuard';

export const dynamic = 'force-dynamic';

/** Direct `/voice` opens the floor logger, which lives on Operations. */
export default async function VoicePage() {
  await guardFreshPage('/voice');
  redirect('/operations');
}
