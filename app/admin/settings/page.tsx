import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { SettingsForm } from '@/components/features/admin/AccountPage';
import { getPlatformSettings } from '@/lib/domains/stats/platformSettings';
import { PageIntro } from '@/components/layout/PageIntro';
import { PageMain } from '@/components/ui/layout';

export const dynamic = 'force-dynamic';

async function LiveSettings() {
  const settings = await getPlatformSettings();
  return <SettingsForm settings={settings} layout="page" />;
}

export default function AdminStoreSettingsPage() {
  return (
    <PageMain width="md">
      <Link
        href="/admin"
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
