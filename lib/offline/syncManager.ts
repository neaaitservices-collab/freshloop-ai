import { MAX_OFFLINE_ATTEMPTS, OFFLINE_FLUSH_DEBOUNCE_MS } from '@/lib/offline/constants';
import { offlineReplayDisposition } from '@/lib/offline/replayDisposition';
import { countPendingOfflineMutations } from '@/lib/offline/idb';
import { isBrowserOnline, subscribeNetworkStatus } from '@/lib/offline/network';
import {
  completeMutation,
  listFlushableMutations,
  markMutationFailed,
  markMutationProcessing,
  releaseStuckProcessing,
} from '@/lib/offline/queue';
import type { OfflineSyncSnapshot } from '@/lib/offline/types';
import { notifyInventoryUpdated } from '@/lib/domains/inventory/inventoryEvents';

const SYNC_EVENT = 'freshloop-offline-sync';

let flushing = false;
let flushTimer: number | null = null;
let started = false;

const defaultSnapshot: OfflineSyncSnapshot = {
  online: true,
  pendingCount: 0,
  phase: 'idle',
  lastSyncedAt: null,
  lastError: null,
};

let snapshot: OfflineSyncSnapshot = { ...defaultSnapshot };

function emitSnapshot(patch: Partial<OfflineSyncSnapshot>) {
  snapshot = { ...snapshot, ...patch, online: isBrowserOnline() };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: snapshot }));
  }
}

async function refreshPendingCount(): Promise<number> {
  try {
    return await countPendingOfflineMutations();
  } catch {
    return snapshot.pendingCount;
  }
}

async function executeMutation(
  row: Awaited<ReturnType<typeof listFlushableMutations>>[number]
): Promise<{ action: 'ok' | 'retry' | 'drop'; message?: string }> {
  await markMutationProcessing(row.id);
  try {
    const res = await fetch(row.url, {
      method: row.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row.body),
      cache: 'no-store',
    });
    const json = (await res.json()) as { success?: boolean; error?: string; deduped?: boolean };
    if (res.ok && (json.success || json.deduped)) {
      await completeMutation(row.id);
      return { action: 'ok' };
    }
    const message = json.error ?? `Sync failed (${res.status}).`;
    if (offlineReplayDisposition(res.status) === 'drop') {
      await completeMutation(row.id);
      return { action: 'drop', message };
    }
    await markMutationFailed(row.id, message);
    if (row.attempts + 1 >= MAX_OFFLINE_ATTEMPTS) {
      await completeMutation(row.id);
      return { action: 'drop', message };
    }
    return { action: 'retry', message };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error during sync.';
    await markMutationFailed(row.id, message);
    if (row.attempts + 1 >= MAX_OFFLINE_ATTEMPTS) {
      await completeMutation(row.id);
      return { action: 'drop', message };
    }
    return { action: 'retry', message };
  }
}

export async function flushOfflineQueue(): Promise<void> {
  if (flushing || !isBrowserOnline()) return;
  flushing = true;
  emitSnapshot({ phase: 'syncing', lastError: null });
  try {
    await releaseStuckProcessing();
    const queue = await listFlushableMutations();
    emitSnapshot({ pendingCount: queue.length });
    let hadError = false;
    let terminalMessage: string | null = null;
    for (const row of queue) {
      if (!isBrowserOnline()) break;
      const outcome = await executeMutation(row);
      if (outcome.action === 'retry') hadError = true;
      if (outcome.action === 'drop') {
        hadError = true;
        if (outcome.message) terminalMessage = outcome.message;
      }
    }
    const remaining = await refreshPendingCount();
    const lastError =
      terminalMessage ??
      (hadError
        ? remaining === 0
          ? 'Some items need attention — will retry when online.'
          : 'Could not sync all queued changes yet.'
        : null);
    if (remaining === 0) {
      notifyInventoryUpdated();
      emitSnapshot({
        phase: hadError ? 'error' : 'idle',
        pendingCount: 0,
        lastSyncedAt: Date.now(),
        lastError,
      });
    } else {
      emitSnapshot({
        phase: hadError ? 'error' : 'idle',
        pendingCount: remaining,
        lastError,
      });
    }
  } finally {
    flushing = false;
  }
}

function scheduleFlush() {
  if (flushTimer !== null) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushOfflineQueue();
  }, OFFLINE_FLUSH_DEBOUNCE_MS);
}

export function requestOfflineFlush(): void {
  if (typeof window === 'undefined') return;
  scheduleFlush();
}

export function startOfflineSyncManager(): () => void {
  if (typeof window === 'undefined' || started) return () => {};
  started = true;
  void refreshPendingCount().then((count) => emitSnapshot({ pendingCount: count }));
  const unsub = subscribeNetworkStatus((online) => {
    emitSnapshot({ online });
    if (online) scheduleFlush();
  });
  const onManual = () => {
    void refreshPendingCount().then((count) => emitSnapshot({ pendingCount: count }));
  };
  window.addEventListener(SYNC_EVENT, onManual);
  if (isBrowserOnline()) scheduleFlush();
  return () => {
    started = false;
    unsub();
    window.removeEventListener(SYNC_EVENT, onManual);
    if (flushTimer !== null) {
      window.clearTimeout(flushTimer);
      flushTimer = null;
    }
  };
}

export function getOfflineSyncSnapshot(): OfflineSyncSnapshot {
  return { ...snapshot, online: isBrowserOnline() };
}

export function subscribeOfflineSync(handler: (state: OfflineSyncSnapshot) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  handler(getOfflineSyncSnapshot());
  const onEvent = (event: Event) => {
    const detail = (event as CustomEvent<OfflineSyncSnapshot>).detail;
    handler(detail ?? getOfflineSyncSnapshot());
  };
  window.addEventListener(SYNC_EVENT, onEvent);
  return () => window.removeEventListener(SYNC_EVENT, onEvent);
}
