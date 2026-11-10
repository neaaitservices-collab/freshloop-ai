import { Suspense } from 'react';
import { requireManagerStaff } from '@/lib/auth/guardRoute';
import { FreshSessionSync } from '@/components/auth/FreshSessionSync';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { AccountPage } from '@/components/features/admin/AccountPage';
import { StoreSettingsEntryCard } from '@/components/features/admin/StoreSettingsEntryCard';
import { CaseBoard } from '@/components/features/inventory/CaseBoard';
import { DashboardFigures, DashboardFiguresSkeleton } from '@/components/features/admin/DashboardFigures';
import { getStockLevelsRsc } from '@/lib/domains/serverDataCache';
import { getAdminStoreStatsBundle } from '@/lib/domains/stats/storeStats';
import { statsRangeQuerySchema } from '@/lib/security/schemas/statsRange';
import { presetRange, torontoRange } from '@/lib/domains/stats/storeTime';

export const dynamic = 'force-dynamic';

function oneParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

async function LiveFigures({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await guardFreshPage('/admin');
  const raw = await searchParams;
  const parsed = statsRangeQuerySchema.safeParse({
    preset: oneParam(raw.preset),
    from: oneParam(raw.from),
    to: oneParam(raw.to),
  });
  let range = null;
  let rangeError: string | null = null;
  let statsQuery = '';
  if (!parsed.success) {
    rangeError = parsed.error.errors[0]?.message ?? 'Invalid date range.';
  } else if (parsed.data.preset || (parsed.data.from && parsed.data.to)) {
    const bounds = parsed.data.preset
      ? presetRange(parsed.data.preset)
      : { from: parsed.data.from!, to: parsed.data.to! };
    range = torontoRange(bounds.from, bounds.to);
    const query = new URLSearchParams();
    if (parsed.data.preset) query.set('preset', parsed.data.preset);
    if (parsed.data.from && parsed.data.to) {
      query.set('from', parsed.data.from);
      query.set('to', parsed.data.to);
    }
    statsQuery = query.toString();
  }
  const { stats, wasteKpi } = await getAdminStoreStatsBundle(range);
  return (
    <DashboardFigures
      stats={stats}
      initialWasteKpi={wasteKpi}
      statsQuery={statsQuery}
      rangeError={rangeError}
    />
  );
}

async function LiveCases() {
  await guardFreshPage('/admin');
  const levels = await getStockLevelsRsc();
  return <CaseBoard levels={levels} showReceipt />;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await guardFreshPage('/admin');
  await requireManagerStaff();
  return (
    <>
      <FreshSessionSync user={user} />
      <AccountPage
      settings={<StoreSettingsEntryCard />}
      figures={
        <Suspense fallback={<DashboardFiguresSkeleton />}>
          <LiveFigures searchParams={searchParams} />
        </Suspense>
      }
    >
      <Suspense fallback={<CaseBoard levels={null} showReceipt />}>
        <LiveCases />
      </Suspense>
    </AccountPage>
    </>
  );
}
