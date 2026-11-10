import { FreshSessionSync } from '@/components/auth/FreshSessionSync';
import { PersonalProfile } from '@/components/features/profile/PersonalProfile';
import { guardFreshPage } from '@/lib/auth/pageGuard';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await guardFreshPage('/profile');
  return (
    <>
      <FreshSessionSync user={user} />
      <PersonalProfile />
    </>
  );
}
