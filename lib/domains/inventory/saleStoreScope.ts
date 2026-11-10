import { InventoryLedgerError } from '@/lib/domains/inventory/ledger';

/** Used when the database has no Store row. Products are not store-keyed. */
export const IMPLICIT_STORE_ID = 'default';

type StoreLookup = {
  store: {
    findFirst: (args: {
      select: { id: true };
      orderBy: { createdAt: 'asc' };
    }) => Promise<{ id: string } | null>;
  };
};

/** The session's store. Staff rows are not store-assigned, so this is the only store. */
export async function callerStoreId(db: StoreLookup): Promise<string> {
  const store = await db.store.findFirst({
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return store?.id ?? IMPLICIT_STORE_ID;
}

/** A client-supplied store id must match the session store. Omitted means the session store. */
export function assertRequestedStore(callerId: string, requestedStoreId?: string): void {
  const requested = requestedStoreId?.trim();
  if (!requested || requested === callerId) return;
  throw new InventoryLedgerError('That store is outside this session.', 'STORE_SCOPE', 403);
}
