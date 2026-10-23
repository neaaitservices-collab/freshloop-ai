# FreshLoop AI — Guide for store managers

This guide explains **what the platform is**, **how your team should use it each day**, and **where you go for numbers and overrides**. No technical setup required—open the app, sign in with your role, and start from **Admin**.

---

## What FreshLoop is (in plain language)

FreshLoop is your store’s **control tower for fresh inventory**. It answers:

- What came in on the truck, at what cost, and at what **retail price** after yield?
- What is on the **floor vs. kitchen prep**, and what should we **pull** before it expires?
- What did we **rescue** into prepared food vs. **markdown** vs. **throw away**?
- What do we need to **order** next?
- Are we hitting our **waste target**?

Everything important is tied to an **inventory ledger**: each receive, move, rescue, and waste is a line your team (or the system) records. That is why Admin charts and Operations KPIs stay aligned with what clerks did on the floor.

---

## Your home screen: Admin (`/admin`)

When you open FreshLoop, you land on **Admin → Today**.

Use it to:

- Scan **headline figures** (waste, recovery, alerts)—sourced from the ledger when live data is connected.
- Jump to the **three daily steps**: Receive → Floor → Kitchen.
- Open **charts** (waste vs. rescue, revenue recovery, department alerts) for weekly reviews.
- Use the **case board** when you need to approve or override an exception (role: manager or admin).
- Manage **staff roles** under Admin → Users if you are an admin.

**Profile vs. Admin:** Non-managers see **Profile** in the nav; managers and admins see full **Admin** tools.

---

## The three-step rhythm (train the whole store on this)

### Step 1 — Receive (`/receive`)

**Who:** Receiving clerk (you spot-check).

**What happens:**

1. Clerk **scans the vendor invoice** (photo) or works from the connected receiving sheet.
2. For each case line, they set **yield** (how much is sellable), **unit type**, and **floor price** / margin.
3. They **Save & update inventory**—product enters the ledger (typically through receiving into storage/floor logic your store uses).
4. If product **did not arrive**, they choose **Not received** → line leaves the active list and goes to **Pending vendor credit** until you mark it credited.
5. **Remove** drops a line without a credit (data entry mistake, duplicate, etc.).

**Your job:** Review pending vendor credits weekly; reconcile with AP. Spot-check that retail prices match your category strategy.

---

### Step 2 — Floor & inventory (`/inventory`, `/inventory/floor`)

**Who:** Floor staff use **Floor** (`/inventory/floor`); managers use full **Inventory** for pricing, yield tweaks, and overview.

**What happens:**

- Staff see **stock by location** (retail floor, kitchen prep, etc.).
- They **transfer** product: e.g. floor → kitchen prep when something is short-dated but usable.
- **Pull sensitivity** (often 2–4 days) drives what surfaces as warning / pull / markdown—adjust in store settings or Operations sliders to match how aggressive you want to be.

**Your job:**

- Set pull policy to match your store (tight on berries, looser on hard squash).
- Use **Inventory** master-detail when you need to fix price, yield, or move stock as manager override.
- Watch for items stuck on floor with **days remaining** low—those should move to kitchen or markdown, not sit.

**Voice:** Floor staff can use **Voice** in the nav to log transfers hands-free (e.g. “ten pounds bruised apples to kitchen”). You audit via ledger and voice log history over time.

---

### Step 3 — Kitchen (`/kitchen`)

**Who:** Deli chef and prep leads.

**What happens:**

- **Kitchen sub-inventories**—same transfer tools as inventory; prep pulls from what the floor sent.
- **Recipe Fusion**—AI suggests prepared items that use surplus across produce, dairy, bakery, pantry (soups, panzanella, parfaits, etc.). Chef can **synthesize** new ideas and print **deli labels** for grab-and-go.
- **Scrap buckets**—where Operations/volumetric scrap is enabled, prep logs waste by bucket size so cost estimates stay honest.

**Your job:** Prioritize rescue SKUs with best margin; tie fusion output to your weekly ad and deli case. Review what still hit **waste**—that feeds next week’s receiving and ordering.

---

## Operations command center (`/operations`)

This is your **shift supervisor screen**, not just reports.

Use it for:

- **Waste KPI** and operational alerts at a glance.
- **Live sub-inventory transfers**—same as Inventory, writes real ledger rows (useful when you are on the floor with a tablet).
- **Volumetric scrap** and other loss capture tools.
- Shortcuts to voice, invoices, and production modals when you are correcting the day in real time.

Think of **Admin** as “how are we trending?” and **Operations** as “what do we fix right now?”

---

## Orders (`/orders`)

**Who:** Manager (and admin).

**What happens:** Buy list based on **par** and current on-hand gaps; support for PO communication to vendors.

**Your job:** Align par with seasonal volume; after a bad waste week, adjust pars before auto-suggested orders overfill you again.

---

## Roles you assign (Admin → Users)

| Role | Typical access |
|------|----------------|
| **ADMIN** | Everything including user management |
| **STORE_MANAGER** | Admin dashboard, Operations, Orders, Inventory, Receive oversight |
| **RECEIVING_CLERK** | Receive, Inventory (not always full admin charts) |
| **FLOOR_STAFF** | Floor view, Voice |
| **DELI_CHEF** | Kitchen, Inventory transfers in prep |

Match roles to job titles so clerks are not buried in charts and you keep overrides on manager accounts.

---

## AI features (what to expect)

| Feature | Staff use | Your oversight |
|---------|-----------|----------------|
| **Invoice scan** | Clerk photographs invoice at receive | Verify odd lines; dispositions for shorts |
| **Voice logger** | Floor speaks transfers | Sample weekly for accuracy |
| **Recipe fusion** | Kitchen generates rescue menus | Approve items that fit labor and equipment |

AI speeds data entry; **you** still own margin targets, food safety, and what actually gets cooked.

---

## Key manager habits (weekly)

1. **Monday:** Admin charts—waste vs. rescue trend by department.  
2. **Daily:** Glance at Today figures; walk Operations if waste is spiking.  
3. **Receiving:** Clear **pending vendor credits** with AP.  
4. **Kitchen:** One fusion or rescue special tied to what the floor pulled.  
5. **Orders:** Adjust pars after promos or weather events.

---

## Glossary

| Term | Meaning |
|------|---------|
| **Ledger** | History of all inventory movements and costs |
| **Yield** | % of a case that is sellable after trim/spoilage at receive |
| **Pull window** | Days before expiration when floor must act |
| **Rescue** | Using product in kitchen/prepared rather than discarding |
| **Disposition** | Not received / removed line on receive, with optional vendor credit |
| **Sub-inventory** | Logical locations: floor, prep, storage, waste, etc. |

---

## Where to learn more

- **[Executive summary](./EXECUTIVE_SUMMARY.md)** — one-page overview for owners and investors.  
- **[Project structure](./PROJECT_STRUCTURE.md)** — for IT or vendors integrating with the app.  
- **README** — developer setup and API overview.

---

## Quick URL reference

| Screen | Path |
|--------|------|
| Dashboard (Today) | `/admin` |
| Operations | `/operations` |
| Receive | `/receive` |
| Full inventory | `/inventory` |
| Clerk floor | `/inventory/floor` |
| Kitchen | `/kitchen` |
| Orders | `/orders` |
| Users | `/admin/users` |

Open the app as **Store Manager** or **Admin** to see the full set in navigation.
