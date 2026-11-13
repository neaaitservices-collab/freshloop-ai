import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { SettingsForm } from '@/components/features/admin/AccountPage';
import { UserManagementTable } from '@/components/features/admin/UserManagementTable';
import { ProfileForm } from '@/components/features/profile/PersonalProfile';
import { FreshSessionSync } from '@/components/auth/FreshSessionSync';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { getPlatformSettings } from '@/lib/domains/stats/platformSettings';
import { PageIntro } from '@/components/layout/PageIntro';
import { PageMain } from '@/components/ui/layout';

export const dynamic = 'force-dynamic';

async function LiveSettings() {
  await guardFreshPage('/admin/settings');
  const settings = await getPlatformSettings();
  return <SettingsForm settings={settings} layout="page" />;
}

export default async function AdminStoreSettingsPage() {
  const user = await guardFreshPage('/admin/settings');
  return (
    <PageMain>
      <FreshSessionSync user={user} />
      <Link
        href="/admin"
        prefetch={false}
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-slate-400 transition hover:text-slate-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Admin dashboard
      </Link>
      <PageIntro
        step="Settings"
        title="Store"
        description="Waste goal, pull window, production scrap and labor, receiving alerts, and the staff roster. Purchase orders open from the Orders section on this page."
      />
      <Suspense fallback={<SettingsForm settings={null} layout="page" />}>
        <LiveSettings />
      </Suspense>

      <section id="orders" className="mt-10 scroll-mt-24 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h2 className="text-lg font-black text-white">Orders</h2>
        <p className="mt-1 text-sm text-slate-400">
          Purchase orders used to sit under More. Open the order list, or start one from an Overview alert.
        </p>
        <Link
          href="/orders"
          prefetch={false}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-400 px-4 text-sm font-black text-slate-950"
        >
          Open orders
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <section id="staff" className="mt-8 scroll-mt-24">
        <h2 className="text-lg font-black text-white">Staff</h2>
        <p className="mt-1 text-sm text-slate-400">Team roster and permissions. Managers only.</p>
        <div className="mt-4">
          <UserManagementTable embedded />
        </div>
      </section>

      <section id="profile" className="mt-8 scroll-mt-24">
        <h2 className="text-lg font-black text-white">Personal profile</h2>
        <p className="mt-1 text-sm text-slate-400">Your name and email.</p>
        <div className="mt-4">
          <ProfileForm />
        </div>
      </section>
    </PageMain>
  );
}
