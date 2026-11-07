import { MAX_OFFLINE_ATTEMPTS } from '@/lib/offline/constants';
import {
  deleteOfflineMutation,
  getOfflineMutation,
  listOfflineMutations,
  putOfflineMutation,
} from '@/lib/offline/idb';
import type { OfflineMutationKind, OfflineMutationRecord } from '@/lib/offline/types';

export function createClientMutationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `mut-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function shouldQueueOffline(error?: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (error instanceof TypeError) return true;
  return false;
}

export async function enqueueOfflineMutation(input: {
  kind: OfflineMutationKind;
  url: string;
  method: 'POST' | 'PATCH';
  body: Record<string, unknown>;
  label: string;
  clientMutationId?: string;
}): Promise<OfflineMutationRecord> {
  const now = Date.now();
  const id = createClientMutationId();
  const clientMutationId = input.clientMutationId ?? id;
  const record: OfflineMutationRecord = {
    id,
    kind: input.kind,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    lastError: null,
    clientMutationId,
    url: input.url,
    method: input.method,
    body: { ...input.body, clientMutationId },
    label: input.label,
  };
  await putOfflineMutation(record);
  return record;
}

export async function listFlushableMutations(): Promise<OfflineMutationRecord[]> {
  const rows = await listOfflineMutations();
  return rows
    .filter((row) => row.status === 'pending' || row.status === 'failed')
    .filter((row) => row.attempts < MAX_OFFLINE_ATTEMPTS)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function markMutationProcessing(id: string): Promise<OfflineMutationRecord | null> {
  const row = await getOfflineMutation(id);
  if (!row) return null;
  const next: OfflineMutationRecord = {
    ...row,
    status: 'processing',
    updatedAt: Date.now(),
  };
  await putOfflineMutation(next);
  return next;
}

export async function markMutationFailed(id: string, message: string): Promise<void> {
  const row = await getOfflineMutation(id);
  if (!row) return;
  await putOfflineMutation({
    ...row,
    status: 'failed',
    attempts: row.attempts + 1,
    lastError: message,
    updatedAt: Date.now(),
  });
}

export async function completeMutation(id: string): Promise<void> {
  await deleteOfflineMutation(id);
}

export async function releaseStuckProcessing(maxAgeMs = 120_000): Promise<void> {
  const rows = await listOfflineMutations();
  const now = Date.now();
  await Promise.all(
    rows
      .filter((row) => row.status === 'processing' && now - row.updatedAt > maxAgeMs)
      .map((row) =>
        putOfflineMutation({
          ...row,
          status: 'pending',
          updatedAt: now,
        })
      )
  );
}
