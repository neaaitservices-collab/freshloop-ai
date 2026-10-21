<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

- Package manager is Bun (`bun.lock`). `bun` and `bunx` must be on the default `PATH` (`/usr/local/bin`); login shells do not load `~/.bashrc`.
- `bunx prisma generate` reads `DATABASE_URL` and `DIRECT_URL` from `prisma/schema.prisma`. Placeholder local URLs are enough; generate does not need a running Postgres.
- `bun run dev` serves Next.js on `0.0.0.0:3000`. `/` redirects to `/dashboard`.
- Inventory reads and status updates stay on the in-memory store when `DATABASE_URL` is unset or contains `localhost:5432` (`lib/db.ts`). A non-local Postgres URL is what switches those reads onto Prisma.
- `GEMINI_API_KEY` is optional. Invoice OCR, voice logging, and recipe fusion return built-in mock payloads when it is missing.
- Checks: `bun run lint` (warnings only), `bunx tsc --noEmit`, `bun run build`. There is no test script.
