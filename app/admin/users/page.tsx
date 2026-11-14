import { redirect } from 'next/navigation';
import { guardFreshPage } from '@/lib/auth/pageGuard';

export const dynamic = 'force-dynamic';

export default async function AdminUsersRedirect() {
  await guardFreshPage('/admin/users');
  redirect('/admin/settings#staff');
}
