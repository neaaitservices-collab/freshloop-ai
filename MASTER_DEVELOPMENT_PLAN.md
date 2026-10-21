# FRESHLOOP AI: MASTER DEVELOPMENT PLAN
**System Context:** You are an Expert Full-Stack Enterprise Architect. You are building "FreshLoop AI", a yield management, recipe rescue, and dynamic inventory platform for independent grocers.

## 0. TECH STACK & GLOBAL RULES (STRICT COMPLIANCE REQUIRED)
*   **Framework:** Next.js 15 (App Router), React 19, Tailwind CSS v4, Lucide React.
*   **Database:** PostgreSQL (via Supabase), Prisma ORM.
*   **AI SDK:** `@google/generative-ai` (Gemini 1.5 Flash Vision, Audio, Text).
*   **RULE 1 (The Ledger):** NEVER create static "Current Stock" columns. All inventory levels MUST be calculated dynamically via `SUM` aggregations of an `Inventory_Transactions` ledger.
*   **RULE 2 (Location Tracking):** All transactions must strictly enforce `From_Location` and `To_Location` (e.g., `Retail_Floor`, `Kitchen_Prep`, `Waste_Bin`).
*   **RULE 3 (Async AI Confirmation):** No AI parsing (voice or image) can write directly to the database. All AI endpoints must return structured JSON to the frontend to trigger a high-contrast `[CONFIRM] / [EDIT]` UI modal.
*   **RULE 4 (Phased Execution):** You must complete this project phase-by-phase. DO NOT move to the next phase until the human explicitly says "Phase [X] Approved."

---

## PHASE 1: DATABASE SCHEMA (Prisma)
**Goal:** Establish the normalized single-source-of-truth.
**Tasks:**
1. Generate `schema.prisma` with the following models:
   - `Product`: ID, Barcode, Name, Department, TargetMargin.
   - `InventoryTransaction`: ID, Timestamp, Product_ID, Qty_Change, Transaction_Type (Receive, Sale, Rescue, Waste, POS_Sale), From_Location, To_Location, Unit_Cost_At_Time, Reference_ID.
   - `StoreSetting`: ID, Target_Waste_Pct, Scrap_Bucket_Volume_L, Estimated_Weight_Per_Liter_kg.
   - `Recipe` & `RecipeBOM`: Defines output products and raw ingredient requirements.
   - `Bundle` & `BundleItem`: For POS Virtual Kitting.
   - `POSMapping`: Links `Product_ID` to external POS SKUs.
2. Generate seed data (`seed.ts`) to populate initial items, settings, and recipes.
**Stop and wait for human approval.**

---

## PHASE 2: CORE LEDGER & INVENTORY SERVICES
**Goal:** Build the backend utilities that execute complex inventory math.
**Tasks:**
1. Create `lib/inventory.ts`.
2. Write `getCurrentStock(productId, location)`: Aggregates ledger transactions.
3. Write `getMovingAverageCost(productId)`: Calculates the current real-time cost based on historical receiving logs.
4. Write `executeBundleSale(bundleId)`: The "Virtual Kitting Explode" function that reads `BundleItem` and deducts raw components from the ledger.
5. Write `calculateRealTimeWastePct()`: Implements the logic: `(Total Known Discard Value + Total Volumetric Scrap Value) / Gross Food Sales`.
**Stop and wait for human approval.**

---

## PHASE 3: AI ENDPOINTS & PRODUCTION LOGIC
**Goal:** Implement the Gemini 1.5 Flash integrations and Kitchen Manufacturing.
**Tasks:**
1. Create `/api/voice-logger/route.ts`: Parses spoken audio into JSON (Item, Qty, Condition, Action: PULL/DISCARD). Implements fuzzy matching if the spoken item name doesn't perfectly match the DB.
2. Create `/api/invoice-ocr/route.ts`: Parses receipt images into JSON (Vendor, Line Items, Unit Costs). Implement "Cost Guardrail" logic (flag if cost changes by >20%).
3. Create `/api/manufacturing/route.ts`: The Universal Rescue Production endpoint. Takes a `Recipe_ID` and `Batch_Output`, deducts from `RecipeBOM`, calculates batch cost using `getMovingAverageCost()`, and adds finished goods to the ledger.
**Stop and wait for human approval.**

---

## PHASE 4: FRONTEND UI - DASHBOARD & KPI'S
**Goal:** Build the Manager's Command Center.
**Tasks:**
1. Build `app/dashboard/page.tsx`: Glassmorphic UI with Tailwind CSS.
2. Build the **Traffic Light Waste KPI Component**: Glows Green if actual waste < `Target_Waste_Pct`, flashes Red if over.
3. Build the **Human Pull Slider Control**: A slider (2-day, 3-day, 4-day) that adjusts how aggressively the Inventory Agent flags aging stock.
4. Build the **Sub-Inventory Tables**: View split inventory by `Retail_Floor` and `Kitchen_Prep`.
**Stop and wait for human approval.**

---

## PHASE 5: FRONTEND UI - STAFF WORKFLOWS & SAFEGUARDS
**Goal:** Build the frictionless floor tools.
**Tasks:**
1. Build `VoiceLoggerModal.tsx`: Includes the **Async Confirmation Loop** (forces user to click "Confirm" after AI parses speech).
2. Build `RecipeProductionModal.tsx`: Includes the **Variance Toggle** (allows cooks to edit exact raw ingredient weights deducted if reality differs from the perfect BOM).
3. Build `VolumetricScrapForm.tsx`: A 1-click form to log "X Buckets of Scraps." Connects to the backend to multiply by Bucket Weight and Blended Average Cost.
**Stop and wait for human approval.**