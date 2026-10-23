# FreshLoop AI 🍃
> **Yield Management & Recipe Rescue Platform for Independent Fresh Grocers**

FreshLoop AI helps independent fresh grocers eliminate inventory shrinkage and maximize gross margins by cross-matching short-dated produce, dairy, bakery, and pantry stock into high-margin prepared deli foods.

---

## For developers

**Architecture:** Next.js App Router monolith — UI in `app/` + `components/features/*`, business logic in **`lib/domains/*`**, PostgreSQL via **Prisma**. Floor stock and waste KPIs come from **`InventoryTransaction`** (`lib/domains/inventory/ledger.ts`, `stock.ts`), not from ad hoc UI state.

**Start here:**

- **[Developer guide](./docs/FOR_DEVELOPERS.md)** — stack, routes, **API table**, domain modules, schema, legacy vs live ledger, extension patterns  
- **[Project structure](./docs/PROJECT_STRUCTURE.md)** — folder conventions  

**Quick map**

| Concern | Location |
|---------|----------|
| Ledger writes | `lib/domains/inventory/ledger.ts` |
| Stock levels / receive post | `lib/domains/inventory/stock.ts` |
| Yield & receiving | `lib/domains/receiving/*` |
| Route handlers | `app/api/**/route.ts` |
| Staff auth | Auth.js — `middleware.ts`, `components/auth/RoleProvider.tsx` |
| Mock / demo data | `lib/legacy/*` (avoid for new features) |

After changes: `npm run build`. Client refresh hook: `freshloop-inventory-updated` event.

**Other docs:** [Deployment (Vercel + Supabase)](./docs/DEPLOYMENT.md) · [Store managers](./docs/FOR_STORE_MANAGERS.md) · [Executive summary](./docs/EXECUTIVE_SUMMARY.md)

---

## 🛠️ Technical Stack
- **Framework & Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS v4, Lucide React icons
- **Database & ORM**: Supabase / PostgreSQL with Prisma ORM
- **AI Engine**: Google Gemini 1.5 Flash via `@google/generative-ai` SDK

---

## ✨ Key Features & Capabilities

### 1. Vendor Invoice OCR (`/api/invoice-ocr`)
- Accepts image uploads of vendor delivery receipts and packing slips.
- Calls **Gemini 1.5 Flash Vision** with structured JSON output mode to extract vendor name, invoice date, line items, unit costs, and total amount across Produce, Dairy, Bakery, and Pantry departments.
- Supports auto-importing scanned line items directly into floor inventory.

### 2. Ambient Voice Floor Logger (`/api/voice-logger`)
- Hands-free floor logging via mic button or spoken text.
- Uses **Gemini 1.5 Flash Audio parsing** to extract spoken transfers (e.g., *"Logged 10 lbs bruised apples and 4L heavy cream"*).
- Returns structured JSON containing items, quantities, condition, allergen warnings, and target action (`KITCHEN_RESCUE`, `MARKDOWN`, or `DISCARD`).

### 3. Inventory & Human Pull Trigger Dashboard (`/dashboard`)
- Interactive glassmorphic UI displaying fresh inventory items across all departments.
- Filter by status: `FRESH`, `WARNING`, `PULL_RESCUE`, `MARKDOWN`.
- **2-day, 3-day, and 4-day Human Pull Slider Controls** for store managers to adjust pull sensitivity thresholds in real-time.

### 4. Recipe Fusion Engine (`/api/recipe-fusion`)
- Cross-matches short-dated items across Produce + Dairy + Bakery + Pantry.
- Generates high-margin prepared foods (e.g., roasted tomato panzanellas, spiced apple dessert parfaits, creamy roasted soups) with target retail prices, batch food costs, chef prep instructions, and gross margin estimates (up to 80%+).

---

## 🚀 Getting Started

### 1. Clone & Install Dependencies
```bash
cd freshloop-ai
npm install
```

### 2. Environment Variables Setup
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Fill at minimum: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `GEMINI_API_KEY`, `NEXTAUTH_URL`, `NEXT_PUBLIC_SITE_URL`.

**Supabase (production / remote):**

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | **Transaction pooler** — port **6543**, append `?pgbouncer=true` (runtime + serverless) |
| `DIRECT_URL` | **Direct session** — port **5432** (required for `prisma migrate deploy` / `migrate dev`) |

For local Postgres, both URLs can point at the same `localhost:5432` database.

Generate session secret:
```bash
openssl rand -base64 32
```

### 3. Database Setup & Migration
```bash
npx prisma migrate dev    # local development
# Production (after deploy): npm run db:push:prod   → prisma migrate deploy
# Optional seed:            npm run db:seed:prod
```

Full Vercel checklist: **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** (includes GitHub Actions migrate on `main`).

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Directory structure

See **[docs/PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md)** for the current layout:

- `app/` — routes and API handlers only  
- `components/ui`, `components/layout`, `components/features/*` — UI by domain  
- `lib/domains/*` — ledger, receiving, stats, AI; `lib/legacy/` for demo APIs  
- `types/`, `hooks/`, `prisma/`
