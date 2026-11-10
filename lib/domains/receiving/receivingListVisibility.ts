import type { ReceivingLog } from '@/lib/domains/receiving/yieldPricing';

/**
 * Posted ledger rows stay on the receive list. The session hide list only
 * removes a line that is still part of the invoice being priced.
 * A disposition hide always wins.
 */
export function receivingLogRemainsVisible(
  log: Pick<ReceivingLog, 'id' | 'canPost'>,
  options: {
    postedIds: ReadonlySet<string>;
    hiddenIds: ReadonlySet<string>;
    invoiceIds: ReadonlySet<string>;
  }
): boolean {
  if (options.hiddenIds.has(log.id)) return false;
  if (log.canPost === false && !options.invoiceIds.has(log.id)) return true;
  return !options.postedIds.has(log.id);
}
