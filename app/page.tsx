import { guardFreshPage } from '@/lib/auth/pageGuard';

export const dynamic = 'force-dynamic';

/** Client navigations to `/` render this segment even when the root layout is reused. */
export default async function RootPage() {
  await guardFreshPage('/');
  return null;
}
