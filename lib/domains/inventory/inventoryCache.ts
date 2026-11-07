import { invalidateLedgerReads } from '@/lib/domains/inventory/ledgerCache';
import { invalidateStoreSettingCache } from '@/lib/domains/stats/storeSettingSelect';
import { invalidateStoreStats } from '@/lib/domains/stats/storeStats';
import { invalidateDuplicateCatalogCache } from '@/lib/domains/inventory/catalogMerge';

/** Invalidate cached ledger reads (stock levels, `/api/inventory`) and admin store stats. */
export function invalidateInventoryCaches(): void {
  invalidateLedgerReads();
  invalidateStoreStats();
  invalidateStoreSettingCache();
  invalidateDuplicateCatalogCache();
}
