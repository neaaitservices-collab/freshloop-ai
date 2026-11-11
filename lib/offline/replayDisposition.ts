const DROP_STATUSES = new Set([400, 403, 404, 409, 422]);

/**
 * Drop a replay only when the same body cannot succeed.
 * 401, 408, 429, 5xx, and network failures stay queued.
 */
export function offlineReplayDisposition(status: number): 'retry' | 'drop' {
  if (DROP_STATUSES.has(status)) return 'drop';
  return 'retry';
}
