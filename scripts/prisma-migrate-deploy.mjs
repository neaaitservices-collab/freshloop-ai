#!/usr/bin/env node
/**
 * Runs `prisma migrate deploy` with a non-empty DIRECT_URL.
 * Supabase: set DATABASE_URL (pooler :6543) and DIRECT_URL (session :5432).
 * If DIRECT_URL is missing, derive a direct URL from common Supabase pooler URLs.
 */
import { spawnSync } from 'node:child_process';

function stripEmpty(value) {
  const v = (value ?? '').trim();
  return v.length > 0 ? v : '';
}

/** Best-effort direct session URL when only the transaction pooler URL is configured. */
function deriveDirectUrlFromDatabaseUrl(databaseUrl) {
  let direct = databaseUrl.trim();
  if (!direct) return '';

  direct = direct.replace(/:6543(\/|\?|#|$)/, ':5432$1');

  const qIndex = direct.indexOf('?');
  if (qIndex === -1) return direct;

  const base = direct.slice(0, qIndex);
  const params = new URLSearchParams(direct.slice(qIndex + 1));
  params.delete('pgbouncer');
  params.delete('connection_limit');
  params.delete('pool_timeout');
  const tail = params.toString();
  return tail ? `${base}?${tail}` : base;
}

function main() {
  const databaseUrl = stripEmpty(process.env.DATABASE_URL);
  let directUrl = stripEmpty(process.env.DIRECT_URL);

  if (!databaseUrl) {
    console.error(
      '[freshloop] DATABASE_URL is required for prisma migrate deploy (pooler URL for Supabase).'
    );
    process.exit(1);
  }

  if (!directUrl) {
    directUrl = deriveDirectUrlFromDatabaseUrl(databaseUrl);
    if (directUrl) {
      console.warn(
        '[freshloop] DIRECT_URL was empty; using derived direct session URL (set DIRECT_URL in GitHub secrets for production).'
      );
      process.env.DIRECT_URL = directUrl;
    }
  }

  if (!stripEmpty(process.env.DIRECT_URL)) {
    console.error(
      '[freshloop] DIRECT_URL is required (Supabase session URL on port 5432). ' +
        'Add repository secrets DATABASE_URL and DIRECT_URL — see docs/DEPLOYMENT.md.'
    );
    process.exit(1);
  }

  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

main();
