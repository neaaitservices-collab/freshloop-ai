import { invalidateLedgerReads } from '@/lib/ledgerCache';
import { invalidateStoreStats } from '@/lib/storeStats';

/** Invalidate cached ledger reads (stock levels, `/api/inventory`) and admin store stats. */
export function invalidateInventoryCaches(): void {
  invalidateLedgerReads();
  invalidateStoreStats();
}
