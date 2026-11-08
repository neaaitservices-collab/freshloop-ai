import { FreshSessionSync } from '@/components/auth/FreshSessionSync';
import { AppShellLayout } from '@/components/layout/AppShellLayout';
import { guardFreshPage } from '@/lib/auth/pageGuard';

/** Runs on every entry to a protected segment, including client-side RSC navigations. */
export default async function ProtectedShell({ children }: { children: React.ReactNode }) {
  const user = await guardFreshPage();
  return (
    <AppShellLayout>
      <FreshSessionSync user={user} />
      {children}
    </AppShellLayout>
  );
}
