import { invalidateLedgerReads } from '@/lib/domains/inventory/ledgerCache';
import { invalidateStoreStats } from '@/lib/domains/stats/storeStats';

/** Invalidate cached ledger reads (stock levels, `/api/inventory`) and admin store stats. */
export function invalidateInventoryCaches(): void {
  invalidateLedgerReads();
  invalidateStoreStats();
}
