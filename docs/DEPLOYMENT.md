# FreshLoop AI — Production deployment (Vercel + Supabase)

End-to-end checklist. After completing these steps, the repo is **Vercel-ready**.

---

## Architecture summary

| Layer | Service |
|-------|---------|
| App | Vercel (Next.js 16 App Router) |
| Database | Supabase PostgreSQL |
| ORM | Prisma 6 (`DATABASE_URL` pooler + `DIRECT_URL` for migrations) |
| Auth | Auth.js v5 JWT (`AUTH_SECRET`) |
| AI | Google Gemini (`GEMINI_API_KEY`) |
| CI | GitHub Actions — `ci.yml` + `database-migrate.yml` |

Repo artifacts:

| File | Purpose |
|------|---------|
| [`.env.example`](../.env.example) | Env template for local + Vercel |
| [`vercel.json`](../vercel.json) | Build/install commands, default region |
| [`instrumentation.ts`](../instrumentation.ts) | Warns if production env is incomplete |
| [`lib/env/server.ts`](../lib/env/server.ts) | Site URL + auth secret helpers |
| [`GET /api/health`](../app/api/health/route.ts) | Deploy smoke test (DB ping) |

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
| `NEXTAUTH_URL` | Yes — e.g. `https://your-app.vercel.app` |
| `NEXT_PUBLIC_SITE_URL` | Yes — same public URL |
| `GEMINI_API_KEY` | Yes |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional (password reset email) |
| `ALLOW_PUBLIC_SIGNUP` | Optional — `false` to lock `/signup` |

**Do not** run `prisma migrate dev` against production.

---

## 3. GitHub Actions

### CI (`.github/workflows/ci.yml`)

On every **pull request** and **push to `main`**:

- `npm run lint`
- `npm run typecheck`
- `npm run build` (with placeholder env vars — no real DB needed for compile)

### Database migrate (`.github/workflows/database-migrate.yml`)

**Manual only** (`workflow_dispatch`). There are **no inputs**. Pushing `main` does not run this workflow. Vercel auto-deploys `main` on its own, so application code can go live before the database has the matching schema.

The job checks out the ref you select and runs `npm run db:push:prod` (`scripts/prisma-migrate-deploy.mjs` → `prisma migrate deploy`).

**Repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|--------|
| `DATABASE_URL` | Required. Production pooler (port 6543). The job fails if it is empty. |
| `DIRECT_URL` | Production direct session (port 5432). If empty, the job warns and the script derives a direct URL from `DATABASE_URL`. Set it explicitly. |

**Trigger**

- GitHub UI: **Actions → Database migrate (production) → Run workflow**. Pick the branch or tag that contains the migrations (usually `main`). Leave inputs blank — the workflow defines none — then run it.
- CLI (no `-f` fields):

```bash
gh workflow run "Database migrate (production)" --ref main
```

`gh workflow run database-migrate.yml --ref main` is the same run.

**Order.** Take a Supabase backup or snapshot first. Apply **additive** migrations before merging or deploying code that depends on them. A push to `main` starts the Vercel deploy immediately and does not wait for this job. Land backward-compatible SQL, run this workflow, verify, then merge the code that reads or writes the new schema.

**Rollback.** The workflow only applies forward migrations. Restore the backup or snapshot to undo. Do not re-run the workflow to reverse SQL.

**Verify** (read-only). Compare the latest row with the newest folder name under `prisma/migrations/`:

```sql
SELECT migration_name, finished_at, rolled_back_at
FROM _prisma_migrations
ORDER BY finished_at DESC NULLS LAST
LIMIT 5;
```

Expect that `migration_name` to match the newest migration folder, `finished_at` set, and `rolled_back_at` null. Alternative, with production `DATABASE_URL` and `DIRECT_URL` set: `npx prisma migrate status`.

Seed is **not** part of this workflow.

> **Never seed production.** Do not run `npm run db:seed:prod`, and do not set `FRESHLOOP_ALLOW_DEMO_SEED=1`, against production. The seed is destructive: it deletes catalog and ledger data and sets the demo password `freshloop`.

---

## 4. First production bootstrap

After the Vercel project exists, apply migrations before traffic depends on the schema. Prefer the workflow in §3 (backup first). With production `DATABASE_URL` and `DIRECT_URL` loaded locally, the same command is:

```bash
npm run db:push:prod
```

Do not seed production. `db:seed:prod` is blocked unless `FRESHLOOP_ALLOW_DEMO_SEED=1`, and that override deletes catalog and ledger rows and sets demo passwords to `freshloop`.

| Script | Command |
|--------|---------|
| `db:push:prod` | `prisma migrate deploy` (via `scripts/prisma-migrate-deploy.mjs`) |
| `db:seed:prod` | `NODE_ENV=production prisma db seed` — **never against production** |
| `ci` | lint + typecheck + build |

---

## 5. Verify deployment

1. **Build** — Vercel log shows `prisma generate` then `Compiled successfully`.
2. **Health** — `GET https://your-app.vercel.app/api/health`  
   Expect `{ "status": "ok", "checks": { "app": "ok", "database": "ok" } }`.
3. **Auth** — `/login` works; `NEXTAUTH_URL` matches the live origin.
4. **AI** — Invoice OCR or voice route returns a structured response (not missing-key 500).
5. **Security** — Set `ALLOW_PUBLIC_SIGNUP=false` when ready.

---

## 6. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `prepared statement already exists` | Pooler URL + `pgbouncer=true` on `DATABASE_URL` |
| Migrations fail on Vercel build | Migrations are not part of `next build`. Apply them with the manual workflow or `npm run db:push:prod` using `DIRECT_URL` |
| Auth redirect loops | `NEXTAUTH_URL` = production URL; set `AUTH_SECRET` |
| Health `database: error` | Wrong `DATABASE_URL`, IP allowlist, or migrations not applied |
| Too many DB connections | Pooler + `connection_limit=1`; Prisma client is singleton per instance |

See also: [FOR_DEVELOPERS.md](./FOR_DEVELOPERS.md).
