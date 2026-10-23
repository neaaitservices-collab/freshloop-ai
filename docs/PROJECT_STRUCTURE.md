# FreshLoop AI — project layout

Monolithic **Next.js App Router** app. URLs unchanged; code lives under feature folders.

## `app/`

Route segments only: `page.tsx`, `layout.tsx`, `route.ts` under `app/api/`.

## `components/`

| Path | Purpose |
| --- | --- |
| `ui/` | Shared Slate & Ocean Steel primitives (badges, yield fields, sliders, chart tooltip) |
| `layout/` | `AppShell`, `Navigation`, `PageIntro` |
| `auth/` | `RoleProvider` |
| `features/inventory/` | Floor, sub-inventory transfers, case board |
| `features/receive/` | Receive screen, yield/pricing board, vendor credit pending |
| `features/orders/` | Buy list, PO email |
| `features/operations/` | Operations center, live transfers, volumetric scrap |
| `features/kitchen/` | Kitchen sub-inventory panel |
| `features/admin/` | Dashboard figures, charts, account, users |
| `features/voice/` | Voice logger / recorder modals |
| `features/invoices/` | Invoice OCR upload |
| `features/recipes/` | Recipe fusion card, production, deli label |

## `lib/`

| Path | Purpose |
| --- | --- |
| `domains/inventory/` | Ledger, stock, caches, moves, par, markdown |
| `domains/receiving/` | Yield math, receiving sheet, dispositions |
| `domains/stats/` | Store stats, waste KPI, platform settings |
| `domains/ai/` | Gemini helpers, API errors |
| `legacy/` | In-memory demo DB + mock catalog (legacy APIs) |
| `utils/` | Roles, units |
| `lib/types.ts` | Re-export of `@/types` for backward-compatible imports |

## `types/`

Global TS types (`types/index.ts`). Prefer `@/types`; `@/lib/types` still works.

Import domain code via `@/lib/domains/...` (e.g. `@/lib/domains/inventory/stock`).

## `hooks/`

`use-role.ts` — re-export of role context (extend with data hooks as needed).

## `prisma/`

Schema, migrations, seed.
