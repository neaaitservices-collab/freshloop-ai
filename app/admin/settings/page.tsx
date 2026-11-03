import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { SettingsForm } from '@/components/features/admin/AccountPage';
import { getPlatformSettings } from '@/lib/domains/stats/platformSettings';
import { PageIntro } from '@/components/layout/PageIntro';

export const dynamic = 'force-dynamic';

async function LiveSettings() {
  const settings = await getPlatformSettings();
  return <SettingsForm settings={settings} layout="page" />;
}

export default function AdminStoreSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-3 py-5 pb-28 sm:px-6 sm:py-8">
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
        description="Waste traffic light goal, default pull window, production scrap $ per bucket, labor, and receiving alerts."
      />
      <Suspense fallback={<SettingsForm settings={null} layout="page" />}>
        <LiveSettings />
      </Suspense>
    </main>
  );
}
