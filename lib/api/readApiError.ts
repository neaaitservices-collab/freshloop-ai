/** Read a user-facing message from a JSON API error body. */
export function readApiError(json: unknown, fallback: string): string {
  if (!json || typeof json !== 'object') return fallback;
  const record = json as Record<string, unknown>;
  if (typeof record.error === 'string' && record.error.trim()) return record.error;
  if (typeof record.message === 'string' && record.message.trim()) return record.message;
  return fallback;
}
