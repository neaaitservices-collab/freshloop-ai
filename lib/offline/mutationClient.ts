import {
  createClientMutationId as createOfflineMutationId,
  enqueueOfflineMutation,
  shouldQueueOffline,
} from '@/lib/offline/queue';
import { requestOfflineFlush } from '@/lib/offline/syncManager';
import type { OfflineMutationKind } from '@/lib/offline/types';

export type MutationClientResult<T> =
  | { ok: true; offline: false; data: T }
  | { ok: true; offline: true; queuedId: string }
  | { ok: false; offline: false; error: string };

/** Explicit export for Next/Turbopack (avoid `export { … } from` re-exports). */
export function createClientMutationId(): string {
  return createOfflineMutationId();
}

export async function postJsonOrQueue<T>(input: {
  kind: OfflineMutationKind;
  url: string;
  body: Record<string, unknown>;
  label: string;
  /** When false, skip queue and return error if offline. */
  allowOfflineQueue?: boolean;
}): Promise<MutationClientResult<T>> {
  const allowQueue = input.allowOfflineQueue !== false;
  const body = { ...input.body };

  if (allowQueue && typeof navigator !== 'undefined' && !navigator.onLine) {
    const record = await enqueueOfflineMutation({
      kind: input.kind,
      url: input.url,
      method: 'POST',
      body,
      label: input.label,
    });
    requestOfflineFlush();
    return { ok: true, offline: true, queuedId: record.id };
  }

  try {
    const res = await fetch(input.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const json = (await res.json()) as T & { success?: boolean; error?: string };
    if (!res.ok || json.success === false) {
      return {
        ok: false,
        offline: false,
        error: (json as { error?: string }).error ?? 'Request failed.',
      };
    }
    return { ok: true, offline: false, data: json };
  } catch (err) {
    if (allowQueue && shouldQueueOffline(err)) {
      const record = await enqueueOfflineMutation({
        kind: input.kind,
        url: input.url,
        method: 'POST',
        body,
        label: input.label,
      });
      requestOfflineFlush();
      return { ok: true, offline: true, queuedId: record.id };
    }
    return {
      ok: false,
      offline: false,
      error: err instanceof Error ? err.message : 'Network error.',
    };
  }
}

export async function patchJsonOrQueue<T>(input: {
  kind: OfflineMutationKind;
  url: string;
  body: Record<string, unknown>;
  label: string;
  allowOfflineQueue?: boolean;
}): Promise<MutationClientResult<T>> {
  const allowQueue = input.allowOfflineQueue !== false;
  const body = { ...input.body };

  if (allowQueue && typeof navigator !== 'undefined' && !navigator.onLine) {
    const record = await enqueueOfflineMutation({
      kind: input.kind,
      url: input.url,
      method: 'PATCH',
      body,
      label: input.label,
    });
    requestOfflineFlush();
    return { ok: true, offline: true, queuedId: record.id };
  }

  try {
    const res = await fetch(input.url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const json = (await res.json()) as T & { success?: boolean; error?: string };
    if (!res.ok || json.success === false) {
      return {
        ok: false,
        offline: false,
        error: (json as { error?: string }).error ?? 'Request failed.',
      };
    }
    return { ok: true, offline: false, data: json };
  } catch (err) {
    if (allowQueue && shouldQueueOffline(err)) {
      const record = await enqueueOfflineMutation({
        kind: input.kind,
        url: input.url,
        method: 'PATCH',
        body,
        label: input.label,
      });
      requestOfflineFlush();
      return { ok: true, offline: true, queuedId: record.id };
    }
    return {
      ok: false,
      offline: false,
      error: err instanceof Error ? err.message : 'Network error.',
    };
  }
}
