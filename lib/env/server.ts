/**
 * Server-only environment helpers (Vercel / Supabase / Auth.js).
 */

function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

export function getAuthSecret(): string | undefined {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
}

/** Canonical origin for Auth.js callbacks and password-reset links. */
export function getAuthOrigin(): string {
  const fromEnv =
    process.env.NEXTAUTH_URL ??
    process.env.AUTH_URL ??
    process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return trimTrailingSlash(fromEnv);
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}

/** Public site URL (metadata, OG). Falls back to auth origin. */
export function getPublicSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXTAUTH_URL;
  if (fromEnv) return trimTrailingSlash(fromEnv);
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return getAuthOrigin();
}

const PRODUCTION_REQUIRED = [
  'DATABASE_URL',
  'DIRECT_URL',
  'GEMINI_API_KEY',
] as const;

/** Warn once at runtime when critical production env vars are missing. */
export function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const missing: string[] = [];
  for (const key of PRODUCTION_REQUIRED) {
    if (!process.env[key]?.trim()) missing.push(key);
  }
  if (!getAuthSecret()) missing.push('AUTH_SECRET (or NEXTAUTH_SECRET)');

  if (missing.length > 0) {
    throw new Error(
      `Missing production environment: ${missing.join(', ')}. See .env.example and docs/DEPLOYMENT.md.`
    );
  }
}
