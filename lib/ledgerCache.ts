interface CacheEntry<T> {
  at: number;
  gen: number;
  value: Promise<T>;
}

let generation = 0;

export function invalidateLedgerReads(): void {
  generation += 1;
}

export function rememberLedgerRead<T>(
  bucket: Map<string, CacheEntry<T>>,
  key: string,
  ttlMs: number,
  load: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const gen = generation;
  const hit = bucket.get(key);
  if (hit && hit.gen === gen && now - hit.at < ttlMs) return hit.value;

  const value = load().catch((error: unknown) => {
    const current = bucket.get(key);
    if (current?.value === value) bucket.delete(key);
    throw error;
  });

  bucket.set(key, { at: now, gen, value });
  void value.then(() => {
    const current = bucket.get(key);
    if (current?.value === value && current.gen !== generation) bucket.delete(key);
  });
  return value;
}
