import { redirect } from 'next/navigation';
import { guardFreshPage } from '@/lib/auth/pageGuard';

export const dynamic = 'force-dynamic';

/** Legacy `/floor` URL → clerk-focused retail floor transfers. */
export default async function FloorPage() {
  await guardFreshPage('/floor');
  redirect('/inventory/floor');
}
