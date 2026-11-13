import { cache, Suspense } from 'react';
import { BuyList } from '@/components/features/orders/BuyList';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { parseOrderAlertSearch } from '@/lib/domains/orders/orderAlertLink';
import { getBuyListLevelsRsc } from '@/lib/domains/serverDataCache';

export const dynamic = 'force-dynamic';

const loadOrdersBuyList = cache(() => getBuyListLevelsRsc());

function oneParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

async function LiveOrders({
  alertFocus,
}: {
  alertFocus: ReturnType<typeof parseOrderAlertSearch>;
}) {
  await guardFreshPage('/orders');
  const levels = await loadOrdersBuyList();
  return <BuyList levels={levels} alertFocus={alertFocus} />;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await guardFreshPage('/orders');
  const raw = await searchParams;
  const alertFocus = parseOrderAlertSearch({
    department: oneParam(raw.department),
    alert: oneParam(raw.alert),
    name: oneParam(raw.name),
  });
  return (
    <Suspense fallback={<BuyList levels={null} alertFocus={alertFocus} />}>
      <LiveOrders alertFocus={alertFocus} />
    </Suspense>
  );
}
