import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { SettingsForm } from '@/components/features/admin/AccountPage';
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
    <PageMain width="md">
      <FreshSessionSync user={user} />
      <Link
        href="/admin"
        prefetch={false}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 transition hover:text-slate-200"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Admin dashboard
      </Link>
      <PageIntro
        step="Settings"
        title="Store"
        description="Waste goal, pull window, production scrap & labor, default order minimum stock (cases), and receiving alerts."
      />
      <Suspense fallback={<SettingsForm settings={null} layout="page" />}>
        <LiveSettings />
      </Suspense>
    </PageMain>
  );
}
