export interface ManufacturingOperationStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
}

const STORAGE_PREFIX = 'freshloop-mfg-op:';

/** Reuse the id until the attempt is settled. A new payload key starts a new batch. */
export function claimManufacturingOperationId(
  store: ManufacturingOperationStore,
  payloadKey: string,
  createId: () => string
): string {
  const existing = store.get(payloadKey);
  if (existing) return existing;
  const id = createId();
  store.set(payloadKey, id);
  return id;
}

/** Drop the id after success or an explicit payload conflict so the next click is a new batch. */
export function settleManufacturingOperationId(
  store: ManufacturingOperationStore,
  payloadKey: string
): void {
  store.delete(payloadKey);
}

export function browserManufacturingOperationStore(): ManufacturingOperationStore {
  return {
    get(key) {
      try {
        return sessionStorage.getItem(STORAGE_PREFIX + key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        sessionStorage.setItem(STORAGE_PREFIX + key, value);
      } catch {
        /* private mode can reject storage; this attempt still sends the id */
      }
    },
    delete(key) {
      try {
        sessionStorage.removeItem(STORAGE_PREFIX + key);
      } catch {
        /* ignore */
      }
    },
  };
}
