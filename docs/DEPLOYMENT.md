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

| Trigger | When |
|---------|------|
| Push to `main` | Changes under `prisma/migrations/**`, `prisma/schema.prisma`, or the workflow |
| Manual | Actions → *Database migrate (production)* → Run workflow |

**Repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|--------|
| `DATABASE_URL` | Production pooler (6543) |
| `DIRECT_URL` | Production direct (5432) |

Runs `npm run db:push:prod` → `prisma migrate deploy`.

Seed is **not** automated in CI.

---

## 4. First production bootstrap

After Vercel’s first successful deploy:

```bash
# From your machine with production env loaded, OR rely on GitHub migrate workflow:
npm run db:push:prod

# Optional — demo catalog + @freshloop.test staff (password: freshloop):
npm run db:seed:prod
```

Package scripts:

| Script | Command |
|--------|---------|
| `db:push:prod` | `prisma migrate deploy` |
| `db:seed:prod` | `NODE_ENV=production prisma db seed` |
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
| Migrations fail on Vercel build | Migrations run in CI/local with `DIRECT_URL`, not during `next build` |
| Auth redirect loops | `NEXTAUTH_URL` = production URL; set `AUTH_SECRET` |
| Health `database: error` | Wrong `DATABASE_URL`, IP allowlist, or migrations not applied |
| Too many DB connections | Pooler + `connection_limit=1`; Prisma client is singleton per instance |

See also: [FOR_DEVELOPERS.md](./FOR_DEVELOPERS.md).
