/** True only when the unique violation is the ledger idempotency primary key. */
export function isLedgerIdempotencyConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  if ((error as { code?: string }).code !== 'P2002') return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  const labels = Array.isArray(target)
    ? target.map(String)
    : typeof target === 'string'
      ? [target]
      : [];
  return labels.some((label) => label === 'key' || label.includes('ledger_idempotency'));
}
