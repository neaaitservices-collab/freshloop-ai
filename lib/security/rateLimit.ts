import { NextResponse } from 'next/server';

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

/** Default mutation window (1 minute). */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Tighter per-route caps for ledger ingest, POS, and AI-heavy handlers.
 * Best-effort in-memory (per server instance); pair with edge/WAF limits in production.
 */
export const HOT_PATH_RATE_LIMITS = {
  posWebhook: 60,
  invoiceOcr: 24,
  receivingPost: 36,
  voiceLogger: 24,
  inventoryMove: 60,
  inventoryLevelsPatch: 48,
} as const;

export type HotPathRateLimitId = keyof typeof HOT_PATH_RATE_LIMITS;

/** Best-effort in-memory limiter (per server instance). Suitable for abuse prevention on hot mutations. */
export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  let bucket = store.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + opts.windowMs };
    store.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > opts.limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { ok: true };
}

export function rateLimitResponse(retryAfterSec: number) {
  return NextResponse.json(
    { success: false, error: 'Too many requests. Please wait and try again.' },
    {
      status: 429,
      headers: { 'Retry-After': String(retryAfterSec) },
    }
  );
}

export function assertMutationRateLimit(
  actorKey: string,
  routeId: string,
  limit: number,
  windowMs = RATE_LIMIT_WINDOW_MS
): NextResponse | null {
  const result = checkRateLimit(`${routeId}:${actorKey}`, { limit, windowMs });
  if (!result.ok) {
    return rateLimitResponse(result.retryAfterSec);
  }
  return null;
}

/** Stricter preset for high-impact routes (see HOT_PATH_RATE_LIMITS). */
export function assertHotPathRateLimit(
  actorKey: string,
  routeId: HotPathRateLimitId,
  windowMs = RATE_LIMIT_WINDOW_MS
): NextResponse | null {
  return assertMutationRateLimit(actorKey, routeId, HOT_PATH_RATE_LIMITS[routeId], windowMs);
}

export function clientIpKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() ?? 'unknown';
}
