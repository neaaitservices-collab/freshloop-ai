import OperationsCenter from '@/components/features/operations/OperationsCenter';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { filterLevelsWithAnyStock } from '@/lib/domains/inventory/subInventoryView';
import { getStockLevels, type StockLevel } from '@/lib/domains/inventory/stock';

export const dynamic = 'force-dynamic';

export default async function OperationsPage() {
  await guardFreshPage('/operations');
  let initialLevels: StockLevel[] | null = null;
  try {
    initialLevels = filterLevelsWithAnyStock(await getStockLevels());
  } catch {
    initialLevels = null;
  }
  return <OperationsCenter initialLevels={initialLevels} />;
}
