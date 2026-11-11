/**
 * Replaying the same body after a 4xx will not succeed.
 * Drop it. Network failures and 5xx stay in the queue.
 */
export function offlineReplayDisposition(status: number): 'retry' | 'drop' {
  if (status >= 400 && status < 500) return 'drop';
  return 'retry';
}
