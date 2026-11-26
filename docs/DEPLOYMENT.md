# FreshLoop AI — Production deployment (Vercel + Supabase)

End-to-end checklist. After completing these steps, the repo is **Vercel-ready**.

Production app: [https://freshloop-ai-zeta.vercel.app](https://freshloop-ai-zeta.vercel.app)

---

## Architecture summary

| Layer | Service |
|-------|---------|
| App | Vercel (Next.js 16 App Router) — auto-deploys `main` |
| Database | Supabase PostgreSQL |
| ORM | Prisma 6 (`DATABASE_URL` pooler + `DIRECT_URL` for migrations) |
| Auth | Auth.js v5 JWT (`AUTH_SECRET`) |
| AI | Google Gemini (`GEMINI_API_KEY`) |
| CI | GitHub Actions — `ci.yml` + `database-migrate.yml` |

Repo artifacts:

| File | Purpose |
|------|---------|
| [`.env.example`](../.env.example) | Env template for local + Vercel |
| [`vercel.json`](../vercel.json) | Build/install commands, default region (`iad1`) |
| [`instrumentation.ts`](../instrumentation.ts) | On the Node.js runtime, calls `assertProductionEnv()` in [`lib/env/server.ts`](../lib/env/server.ts), which **throws** if production env is incomplete |
| [`lib/env/server.ts`](../lib/env/server.ts) | Site URL + auth secret helpers |
| [`GET /api/health`](../app/api/health/route.ts) | Deploy smoke test (DB ping) |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | PR / `main` CI: lint, typecheck, `prisma migrate deploy` on ephemeral Postgres 16, tests, build |
| [`.github/workflows/database-migrate.yml`](../.github/workflows/database-migrate.yml) | **Manual** production migrate (`workflow_dispatch` only) |

---

## Migrate-before-promote checklist

Vercel auto-deploys every push or merge to `main`. Production schema is **not** applied by that deploy. The **only** production migrate path is the manual GitHub Actions workflow **Database migrate (production)** (`.github/workflows/database-migrate.yml`). That workflow checks out the selected ref and runs `scripts/prisma-migrate-deploy.mjs` (`prisma migrate deploy`) with the repository secrets. Do not treat local `npm run db:push:prod` as a production migrate path.

**Do not run a production migrate, and do not merge a schema-dependent PR, without Nelson’s explicit yes.** Lead Code & Reviewer approval is also required before any production deploy of a PR.

### Pre-flight (required before every production promote)

1. **Environment variables verified (Vercel / backend)**  
   Confirm Production (and any Preview used for staging) matches [`.env.example`](../.env.example): `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` (or `NEXTAUTH_SECRET`), `NEXTAUTH_URL`, `NEXT_PUBLIC_SITE_URL`, `GEMINI_API_KEY`. Set `OPENAI_API_KEY` if Whisper voice is in use, `POS_WEBHOOK_SECRET` if POS ingest is in use, and optional `RESEND_API_KEY` / `EMAIL_FROM`. Confirm GitHub Actions secrets `DATABASE_URL` and `DIRECT_URL` are set for the migrate workflow (see §3).
2. **Prisma / Supabase migrations tested and reversible**  
   CI already runs `npx prisma migrate deploy` against ephemeral Postgres 16 on every pull request. If a non-production Supabase (or preview) database exists, apply the same migrations there first and confirm the app boots. Prefer expand/contract (additive, backward-compatible) SQL so a failed promote does not require an immediate down-migration. Prisma does not ship automatic down-migrations; reversibility means a written undo plan (new forward migration, or a Supabase backup / PITR restore).
3. **Rollback step defined**  
   App: Vercel instant rollback / promote the previous successful Production deployment.  
   Database: restore the Supabase backup or point-in-time snapshot taken **before** migrate. Do not re-run the migrate workflow to reverse SQL. See [Rollback](#rollback) below.
4. **Post-deploy smoke-test endpoints listed and ready**  
   See [Post-deploy smoke tests](#post-deploy-smoke-tests). Minimum: `GET /api/health` and `/login` on the production origin.

### Check migration status before promoting or merging

With production `DATABASE_URL` and `DIRECT_URL` loaded in a **local, read-only** shell (do not run `prisma migrate dev`, `npm run db:push:prod`, or `db:seed:prod` against production):

```bash
npx prisma migrate status
```

Expect the pending list to match the migration folders you intend to apply, and no unexpected failed migrations. Alternative (SQL, also read-only):

```sql
SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
FROM _prisma_migrations
ORDER BY finished_at DESC NULLS LAST
LIMIT 10;
```

Compare `migration_name` to the newest folder under `prisma/migrations/`. `finished_at` should be set and `rolled_back_at` should be null for applied rows.

### Production migrate — manual workflow, Nelson’s yes only

- Production migrate is **manual only** (`on: workflow_dispatch`). Pushing or merging to `main` does **not** run it.
- Run it **only after Nelson’s explicit yes** for that migrate (which ref, and that it is production).
- GitHub UI: **Actions → Database migrate (production) → Run workflow**. Pick the branch or tag that contains the migrations. The workflow defines no inputs.
- CLI (no `-f` fields):

```bash
gh workflow run "Database migrate (production)" --ref <branch-or-tag>
```

Take a Supabase backup or snapshot first. After the job succeeds, re-run `npx prisma migrate status` (or the SQL above) and confirm the new folders are applied.

**Never seed production.** Do not run `npm run db:seed:prod`, and do not set `FRESHLOOP_ALLOW_DEMO_SEED=1`, against production. The seed is destructive: it deletes catalog and ledger data and sets the demo password `freshloop`.

### Race: Vercel auto-deploy of `main` vs manual migrate

A merge to `main` starts the Vercel Production deploy immediately. The migrate workflow does not start, does not gate the deploy, and does not block traffic. New application code can therefore go live against an old schema (or, if someone migrated first from a different ref, old code can run briefly against a new schema).

**How to avoid the race**

1. **Preferred for schema-dependent PRs — migrate before merge.** After pre-flight, status check, and Nelson’s yes, run **Database migrate (production)** on the **PR branch** (the workflow checks out the ref you pick). Verify `prisma migrate status`. Only then merge to `main` so Vercel’s auto-deploy finds the schema already applied.
2. **Always keep migrations backward compatible (expand/contract).** Land additive SQL first (new tables, new nullable columns, no breaking drops or renames). New code that *requires* the new schema merges only after the migrate has succeeded. Drop or rename columns in a later PR, after the old code is no longer in production.
3. **Do not** merge breaking schema and code in one shot and hope to migrate “right after.” Vercel will already be deploying.
4. **Do not** run `prisma migrate deploy` from the Vercel build. `npm run build` is `prisma generate && next build` only.

### Rollback

| Layer | Action |
|-------|--------|
| App | In the Vercel dashboard, open **Deployments**, select the last known-good **Production** deployment, and **Promote** / instant rollback it (or `vercel rollback` if using the CLI against this project). This is immediate and does not revert git `main`. |
| Database | The migrate workflow only applies **forward** migrations. Restore the pre-migrate Supabase backup or PITR snapshot. Do not re-run the workflow to undo SQL. Do not run `prisma migrate dev` against production. |
| Combined undo | If the new schema must be reversed without a snapshot restore, write a **new forward migration** that undoes the change (contract phase), test it off-production, get Nelson’s yes, then apply it with the same manual workflow. |

If you roll the app back but leave a forward migration in place, the previous deployment must still run against the new schema. That is another reason to use expand/contract migrations.

### Post-deploy smoke tests

Production origin: `https://freshloop-ai-zeta.vercel.app`

| Check | Endpoint / action | Expected |
|-------|-------------------|----------|
| Health (app + DB) | `GET https://freshloop-ai-zeta.vercel.app/api/health` | HTTP 200 and `{ "status": "ok", "checks": { "app": "ok", "database": "ok" }, "timestamp": "..." }`. HTTP 503 with `"status": "degraded"` and `"database": "error"` means the app is up but the database ping failed. |
| Auth | `https://freshloop-ai-zeta.vercel.app/login` | Login page loads; a known staff account can sign in. `NEXTAUTH_URL` must match this origin. |
| AI (if that release touches OCR / voice) | Invoice OCR (`POST /api/invoice-ocr`) or voice (`POST /api/voice`, `POST /api/voice-logger`) **without** `confirmCommit` | Structured parse/transcript response, not a missing-key 500 (`GEMINI_API_KEY`; `OPENAI_API_KEY` for Whisper). **Never send `confirmCommit: true` in a production smoke test.** On `/api/invoice-ocr`, `confirmCommit: true` commits the stored draft via `commitInvoiceOcrReceipts` (ledger receipts). On `/api/voice-logger`, `confirmCommit: true` with `confirmedItems` writes `InventoryTransaction` rows. |
| POS (if that release touches ingest) | `POST /api/pos/webhook` | **Do not ingest a new `externalRef` in production.** (1) Missing or wrong `Authorization: Bearer` must return HTTP 401 `{ "success": false, "error": "Unauthorized POS webhook." }` — the secret is `POS_WEBHOOK_SECRET` (timing-safe compare to `Bearer ${secret}`). (2) Allowed smoke: replay a **known existing** `externalRef` with the same lines; expect HTTP 200 `{ "success": true, "idempotent": true }` and **no new ledger rows** (`InventoryTransaction` where `referenceId` is that ref is unchanged). (3) Posting a **new** `externalRef` actually records sales (`idempotent: false`) — do that in production **only with Nelson’s explicit yes**. |
| Signup lock | `POST /api/auth/signup` and `/signup` | In production, signup is locked unless `ALLOW_PUBLIC_SIGNUP` is exactly `true` (`isPublicSignupEnabled()` in `lib/auth/registerStaff.ts`). Unset or any other value → registration closed; `POST /api/auth/signup` returns HTTP 403 (`Registration is closed…`). `/signup` may still render the form; the API is the gate. Do not create an account in a smoke test. |

---

## 1. Supabase database URLs

**Project Settings → Database → Connection string**

| Variable | Use | Supabase |
|----------|-----|----------|
| `DATABASE_URL` | Runtime (Vercel, Prisma Client) | **Transaction pooler**, port **6543**, `?pgbouncer=true` (+ often `&connection_limit=1`) |
| `DIRECT_URL` | `prisma migrate deploy` | **Session**, port **5432** |

`prisma/schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

Local dev: both URLs may point to the same `localhost:5432` database.

---

## 2. Vercel project

1. Import the GitHub repo; framework **Next.js** (auto-detected).
2. **`vercel.json`** sets `buildCommand`: `npm run build` → `prisma generate && next build`.
3. **`postinstall`**: `prisma generate` (helps dependency cache on Vercel).

### Environment variables (Production)

Copy from [`.env.example`](../.env.example):

| Variable | Required |
|----------|----------|
| `DATABASE_URL` | Yes |
| `DIRECT_URL` | Yes |
| `AUTH_SECRET` or `NEXTAUTH_SECRET` | Yes (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Yes — e.g. `https://freshloop-ai-zeta.vercel.app` |
| `NEXT_PUBLIC_SITE_URL` | Yes — same public URL |
| `GEMINI_API_KEY` | Yes |
| `OPENAI_API_KEY` | If Whisper push-to-talk is used |
| `POS_WEBHOOK_SECRET` | If `POST /api/pos/webhook` is used |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional (password reset email) |
| `ALLOW_PUBLIC_SIGNUP` | Locked in production unless set to exactly `true`. Leave unset (or any other value) to keep `POST /api/auth/signup` closed. |

**Do not** run `prisma migrate dev` against production.

---

## 3. GitHub Actions

### CI (`.github/workflows/ci.yml`)

On every **pull request** and **push to `main`**, job **Lint, typecheck, test, build** (`verify`):

- `npm run lint`
- `npm run typecheck`
- `npx prisma migrate deploy` against ephemeral Postgres 16 (service container)
- `npm run test`
- `npm run build` (`prisma generate && next build`, with placeholder env vars)

This is a required status check on `main`. It is **not** a production migrate.

### Database migrate (`.github/workflows/database-migrate.yml`)

**Manual only** (`workflow_dispatch`). There are **no inputs**. Pushing `main` does not run this workflow. See [Migrate-before-promote checklist](#migrate-before-promote-checklist) for the required order, Nelson’s yes, status check, and race avoidance.

The job checks out the ref you select and runs `scripts/prisma-migrate-deploy.mjs` (`prisma migrate deploy`) with the `DATABASE_URL` and `DIRECT_URL` repository secrets. That is the only production migrate path — do not run the same script locally against production.

**Repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|--------|
| `DATABASE_URL` | Required. Production pooler (port 6543). The job fails if it is empty. |
| `DIRECT_URL` | Production direct session (port 5432). If empty, the job warns and the script derives a direct URL from `DATABASE_URL`. Set it explicitly. |

**Purchase orders (`20261125120000_purchase_order_durable_status`).** This is a schema-dependent change. A production migrate needs Nelson’s explicit yes and a Supabase backup, and it runs through **Database migrate (production)** before the app deploy (migrate-before-promote above). Do not run it locally against production. The new client reads `product_ids`, `updated_at`, and `cycle_key` even for the existing mailto log, so the migration has to land first. Migrate, then deploy this application immediately. The migration drops the unique index on `(supplier_id, line_key)` that the previous mailto guard uses, so a double open on the old code can insert two rows. Do not leave traffic on that old code after the migration. `updated_at` backfills existing mailto rows with the migration timestamp; that value is cosmetic. Do not roll the application back once any row has status `APPROVED`: the previous client does not know that enum value.

Seed is **not** part of this workflow.

---

## 4. First production bootstrap

After the Vercel project exists, apply migrations before traffic depends on the schema. The **only** production migrate path is the manual workflow in §3 (Supabase backup or snapshot first, then Nelson’s explicit yes). Do not run `npm run db:push:prod` (or `prisma migrate deploy` / `prisma migrate dev`) locally against production.

Do not seed production. `db:seed:prod` is blocked unless `FRESHLOOP_ALLOW_DEMO_SEED=1`, and that override deletes catalog and ledger rows and sets demo passwords to `freshloop`.

| Script | Command |
|--------|---------|
| `db:push:prod` | Invoked **only** by the manual GitHub workflow (`scripts/prisma-migrate-deploy.mjs` → `prisma migrate deploy`). **Do not run locally against production.** |
| `db:seed:prod` | `NODE_ENV=production prisma db seed` — **never against production** |
| `ci` | lint + typecheck + test + build |

---

## 5. Verify deployment

Follow [Post-deploy smoke tests](#post-deploy-smoke-tests). Also confirm the Vercel build log shows `prisma generate` then `Compiled successfully`.

---

## 6. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `prepared statement already exists` | Pooler URL + `pgbouncer=true` on `DATABASE_URL` |
| Migrations fail on Vercel build | Migrations are not part of `next build`. Apply them only with the manual **Database migrate (production)** workflow (backup first, Nelson’s yes). Do not run `npm run db:push:prod` locally against production. |
| Auth redirect loops | `NEXTAUTH_URL` = production URL; set `AUTH_SECRET` |
| Health `database: error` / HTTP 503 | Wrong `DATABASE_URL`, IP allowlist, or migrations not applied |
| Too many DB connections | Pooler + `connection_limit=1`; Prisma client is singleton per instance |
| New code 500s after a merge, health DB ok | Likely the auto-deploy / migrate race — check `prisma migrate status` and roll back the Vercel deployment if needed |

See also: [FOR_DEVELOPERS.md](./FOR_DEVELOPERS.md).
