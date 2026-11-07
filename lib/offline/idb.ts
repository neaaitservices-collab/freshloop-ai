import {
  OFFLINE_DB_NAME,
  OFFLINE_DB_VERSION,
  OFFLINE_STORE_MUTATIONS,
} from '@/lib/offline/constants';
import type { OfflineMutationRecord } from '@/lib/offline/types';

let dbPromise: Promise<IDBDatabase> | null = null;

function openOfflineDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available.'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE_MUTATIONS)) {
        const store = db.createObjectStore(OFFLINE_STORE_MUTATIONS, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed.'));
  });
  return dbPromise;
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openOfflineDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(OFFLINE_STORE_MUTATIONS, mode);
        const store = tx.objectStore(OFFLINE_STORE_MUTATIONS);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed.'));
      })
  );
}

export async function putOfflineMutation(record: OfflineMutationRecord): Promise<void> {
  await withStore('readwrite', (store) => store.put(record));
}

export async function getOfflineMutation(id: string): Promise<OfflineMutationRecord | null> {
  const row = await withStore<OfflineMutationRecord | undefined>('readonly', (store) => store.get(id));
  return row ?? null;
}

export async function deleteOfflineMutation(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id));
}

export async function listOfflineMutations(): Promise<OfflineMutationRecord[]> {
  return withStore<OfflineMutationRecord[]>('readonly', (store) => store.getAll());
}

export async function countPendingOfflineMutations(): Promise<number> {
  const all = await listOfflineMutations();
  return all.filter((row) => row.status === 'pending' || row.status === 'failed').length;
}

export function resetOfflineDbForTests(): void {
  dbPromise = null;
}
