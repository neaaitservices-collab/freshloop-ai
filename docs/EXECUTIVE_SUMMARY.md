# FreshLoop AI — Executive summary (one page)

## Problem

Independent fresh grocers lose margin twice: **shrink** (product that never sells before it spoils) and **firefighting** (staff moving product without a shared picture of cost, yield, or rescue options). Spreadsheets and POS alone rarely answer: *What should we pull today? What did we waste in dollars? Did receiving match the invoice?*

## Solution

**FreshLoop AI** is a store operations platform that ties **receiving → floor inventory → kitchen rescue → reordering** to a single **inventory ledger**. Every receive, transfer, rescue, sale, and waste event is recorded with location, cost, and staff context so managers see **units at risk**, **revenue impact**, and **what worked** (markdown vs. cook vs. discard).

## Who it serves

| Stakeholder | Outcome |
|-------------|---------|
| **Owner / GM** | Lower waste % vs. target, higher prepared-foods margin, audit trail for loss prevention |
| **Store manager** | One dashboard (Admin + Operations), pull rules, overrides, buy list |
| **Receiving** | Invoice scan, yield pricing, vendor credit tracking for short shipments |
| **Floor & deli** | Simple floor view, voice logging, kitchen transfers and recipe rescue |

## How the store runs on FreshLoop (daily loop)

1. **Receive** — Price each delivery case (yield + floor price); stock the ledger; flag **not received** lines for vendor credit.
2. **Floor** — Pull items inside your **2–4 day** window; move stock to kitchen prep or markdown before discard.
3. **Kitchen** — Turn rescue ingredients into prepared items (Recipe Fusion + labels); log scrap by bucket volume where used.
4. **Orders** — Replenish from par and on-hand gaps.
5. **Admin / Operations** — Review KPIs, charts, cases, and live transfers without leaving one app.

## Differentiators

- **Ledger-first inventory** — Not just “qty on hand”; full movement history across **Receiving, Main Storage, Retail Floor, Kitchen Prep, Waste**, etc.
- **Yield at receive** — Retail unit economics set when product enters the store, not after shrink appears.
- **AI where hands are busy** — Invoice OCR and voice capture for back dock and floor; recipe ideas for cross-department rescue.
- **Role-based UX** — Clerks see floor tools; managers see analytics and policy controls.

## Technology (brief)

Modern web app (Next.js, PostgreSQL/Supabase, Prisma). **Google Gemini** powers OCR, voice parsing, and recipe generation. Deployed as a single application with in-app API routes— suitable for one store or a small chain with per-store databases.

## Metrics the platform is built to improve

- **Waste units and waste %** vs. store target  
- **Revenue lost / recovered** (full price vs. markdown vs. rescue sale)  
- **Receiving accuracy** (pending vendor credits, disposition audit)  
- **Prepared foods margin** on fusion/manufactured SKUs  

## Status & roadmap direction

Core flows—receive, inventory transfers, floor view, kitchen hub, operations center, admin charts, receiving dispositions—are implemented in the product. POS real-time sync, fully automated markdown optimization, and chain-wide rollups are natural extensions on the same ledger and product model.

## Contact / next step

Pilot with one store: connect receiving (sheet or scan), train three roles (receive, floor, kitchen), and review **Admin → Today** KPIs after two weeks against baseline shrink.
