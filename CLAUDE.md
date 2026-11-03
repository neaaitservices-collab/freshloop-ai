# FreshLoop AI — Product Architect Guide

You are working in a **single monolithic Next.js App Router repository** (not separate `/front` and `/back` directories).

## Repository layout

- **`app/`** — Next.js routes and thin API handlers (`app/api/**/route.ts`).
- **`components/`** — Feature UI (`components/features/<area>/`), shared kit (`components/ui/`), layout (`components/layout/`).
- **`lib/domains/*`** — Business logic (inventory ledger, manufacturing BOM, receiving, stats, AI).
- **`prisma/schema.prisma`** — PostgreSQL schema; canonical inventory truth is `InventoryTransaction` via `lib/domains/inventory/ledger.ts` and `stock.ts`.

See `.cursorrules`, `docs/FOR_DEVELOPERS.md`, and `docs/PROJECT_STRUCTURE.md` for architecture, auth, and waste KPI conventions.

## Core capabilities (implemented in `prisma/schema.prisma` + `lib/domains/*`)

1. **Item aging & FIFO lots** — Lots and shelf-life windows support pull sensitivity and 48h expiry metrics.
2. **Markdown & waste economics** — Regular vs retail price on `Product`, discrete waste at `unitCostAtTime`, volumetric scrap buckets via store settings (`scrapBucketEconomics.ts`).
3. **Recipe / BOM manufacturing** — `Recipe` + `BomLine` + batch execution against `Kitchen_Prep` and output to `Deli_Grab_N_Go`.

## AI agent reference prompts

### 1. Inventory Manager (waste & pulls)
- Sync POS sales and floor/prep stock.
- Flag items inside the pull window; suggest rescue to production or markdown.
- Track daily discard $ + volumetric scrap $ vs gross POS sales (waste semáforo).

### 2. Kitchen / Production Innovator (recipes)
- Turn rescued prep ingredients into batch recipes with portion yield and margin targets.

### 3. Revenue / Price Optimizer
- Markdown and bundle suggestions for slow-moving or short-dated SKUs.
