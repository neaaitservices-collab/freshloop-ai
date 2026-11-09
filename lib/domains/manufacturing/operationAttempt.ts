export interface ManufacturingOperationStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
  keys(): string[];
}

const STORAGE_PREFIX = 'freshloop-mfg-op:';

/** Storage key for one staff member. Empty identity returns null and must not be stored. */
export function manufacturingOperationStorageKey(
  staffId: string,
  payloadKey: string
): string | null {
  const id = staffId.trim();
  if (!id) return null;
  return `user:${id}:${payloadKey}`;
}

export function isUnscopedManufacturingOperationKey(storageKey: string): boolean {
  return !storageKey.startsWith('user:');
}

/** Drop pre-isolation keys so a later sign-in cannot reuse them. Scoped keys stay. */
export function purgeUnscopedManufacturingOperationKeys(
  keys: readonly string[],
  remove: (key: string) => void
): number {
  let removed = 0;
  for (const key of keys) {
    if (!isUnscopedManufacturingOperationKey(key)) continue;
    remove(key);
    removed += 1;
  }
  return removed;
}

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
    keys() {
      try {
        const found: string[] = [];
        for (let index = 0; index < sessionStorage.length; index += 1) {
          const full = sessionStorage.key(index);
          if (full?.startsWith(STORAGE_PREFIX)) found.push(full.slice(STORAGE_PREFIX.length));
        }
        return found;
      } catch {
        return [];
      }
    },
  };
}
