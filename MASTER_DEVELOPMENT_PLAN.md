# FreshLoop AI — Platform description

FreshLoop AI is a waste-reduction system for an independent grocery store. Staff receive cases, price them for the shelf, pull short-dated product off the floor, cook rescued product in the kitchen, and discard what cannot be saved. Managers see the money: rescued value, waste against a target, inventory value, low stock, and the orders that restock the store.

The app is one Next.js site (App Router, React 19, Tailwind CSS v4). Data lives in Supabase PostgreSQL through Prisma. Stock is never a stored column. Every quantity is the sum of signed ledger rows. Gemini reads invoices, floor voice notes, and recipe requests, and it never writes the database until a person confirms the draft.

The store in the seed data is FreshLoop Artisanal Market - Cobourg.

## How a day moves

1. **Receive.** A clerk scans a vendor invoice or picks a case from the receiving sheet, sets pack size, yield, and shelf price, and posts the case onto the ledger as a receipt from `External_Vendor` to `Retail_Floor`.
2. **Inventory & floor.** One screen at `/inventory` shows everything on hand from the ledger (that is what is on the retail floor). Staff set a 2, 3, or 4 day pull window, work a short-dated action board, markdown items for 30% off (session label), send stock to the kitchen (`Rescue`), or discard (`Waste`). The full on-hand catalog sits in a collapsible section below.
3. **Kitchen.** The kitchen turns short-dated ingredients into a prepared item, prints a deli label, and can log scrap buckets. A confirmed production batch consumes the recipe bill of materials from `Kitchen_Prep` and adds the finished product to the ledger.
4. **Orders.** Anything below its case alert level becomes a supplier order the manager can approve, print, or email.
5. **Admin.** Managers see the day’s numbers, the three work steps, their own profile, store settings, staff, and the case editor. Everyone else opens the same address and sees only their profile.

`/` and `/dashboard` both open `/admin`. `/floor` redirects to `/inventory/floor` (clerk retail-only transfers). `/rescue` redirects to `/inventory`. `/recipes` opens `/kitchen`. `/admin/users` opens `/admin`.

## Rules the system follows

- **Immutable ledger.** `Product` has no current-stock column. On-hand quantity is `SUM(Qty_Change)` from `Inventory_Transactions`.
- **Every move names both places.** Each transaction stores `From_Location` and `To_Location`.
- **Locations.** `External_Vendor`, `Main_Storage`, `Retail_Floor`, `Kitchen_Prep`, `Deli_Grab_N_Go`, `Customer_Out`, `Waste_Bin`.
- **Transaction types.** `Receive`, `Sale`, `Rescue`, `Waste`, `POS_Sale`.
- **Rescue is a double entry.** The retail-floor quantity goes out of `Retail_Floor` and into `Kitchen_Prep`. The store total does not change.
- **Waste is a single negative.** `Qty_Change` is negative, type `Waste`, from `Retail_Floor` to `Waste_Bin`. That quantity leaves the store total.
- **AI confirmation.** Voice and vision return a structured draft. The person presses confirm or edit before any row is written.
- **Acting as someone.** The signed-in person is chosen in the shell and stored in the browser under `freshloop-active-user`. It is a staff switcher, not a password login. API calls that accept a role or staff id trust the body the browser sends.
- **Recipe execution.** The manufacturing route is the kitchen bill-of-materials path. Recipe rows carry `restrictedToRole` (default `KITCHEN_STAFF`).

## Departments, units, and item statuses

Departments: `PRODUCE`, `DAIRY`, `BAKERY`, `PANTRY`, `DELI_KITCHEN`.

Units: `KG`, `LBS`, `LITER`, `ML`, `UNIT`, `BUNCH`, `LOAF`, `TUB`, `CASE`. The pricing screens also speak in retail units of `units`, `quarts`, and `lbs`.

Legacy item statuses used by the floor queue: `FRESH`, `WARNING`, `PULL_RESCUE`, `MARKDOWN`, `DISCARDED`.

Floor target actions: `KITCHEN_RESCUE`, `MARKDOWN`, `DISCARD`.

Recipe fusion statuses: `PROPOSED`, `IN_KITCHEN`, `COMPLETED`.

## People and what they can open

| Role | Label | Home | Can open |
| --- | --- | --- | --- |
| `ADMIN` | Admin | `/admin` | Every page |
| `STORE_MANAGER` | Store manager | `/admin` | Every page |
| `RECEIVING_CLERK` | Receiving | `/receive` | Receive, Inventory, and Profile |
| `FLOOR_STAFF` | Floor | `/inventory/floor` | Floor moves (retail only), the voice button, and Profile |
| `DELI_CHEF` | Kitchen | `/kitchen` | Kitchen and Profile |

`AppShell` sends a person away from a page their role cannot open. `/admin` is open to every role. Managers see the full dashboard there. Everyone else sees Profile.

## Shell

`app/layout.tsx` wraps the app in `RoleProvider`, sets the title “FreshLoop AI • Yield Management & Recipe Rescue”, and locks the viewport so the phone layout does not zoom.

`components/shell/AppShell.tsx` is the frame: side navigation on a wide screen, a top bar and a bottom tab bar on a phone, the “Acting as” switcher, and the shared `VoiceLoggerModal` unless the page supplies its own voice handler.

`components/shell/PageIntro.tsx` is the page heading: a small step label, a title, a description, and an optional action.

`components/Navigation.tsx` is the live menu.

| Item | Address | Who sees it |
| --- | --- | --- |
| Admin | `/admin` | Managers. It is the first item and the logo target. |
| Profile | `/admin` | Receiving, floor, and kitchen. Same address, user icon. |
| Receive | `/receive` | Admin, store manager, receiving clerk |
| Inventory | `/inventory` (managers/clerks) or `/inventory/floor` (floor staff nav label **Floor**) | Admin, store manager, receiving clerk, floor staff |
| Voice | Opens the voice modal | Admin, store manager, floor staff |
| Kitchen | `/kitchen` | Admin, store manager, deli chef |
| Orders | `/orders` | Admin, store manager |

The logo goes to `/admin` for a manager and to that role’s first work page for everyone else. The side panel can collapse. `components/Navbar.tsx` is an older bar (“Inventory & Pricing”) and is not mounted by the shell.

## Admin dashboard — `/admin`

This is the manager home. Figures stream in their own boundary so the rest of the page paints while the numbers load. The same pattern is used for settings and the case editor.

Order on the page:

1. **Store dashboard.** Eyebrow “Store dashboard”, title “Admin”.
2. **Figures** (`DashboardFigures` → `AdminStats`).
3. **The day’s three steps.** Receive, Inventory & floor, Kitchen, plus “Open the full ledger” (`/operations`).
4. **Personal information.** Name, email, position. Role is kept as-is on save. `PATCH /api/users/:id`.
5. **Store settings.**
6. **Staff.**
7. **Edit a case.**

Floor, kitchen, and receiving see only the profile block. Title becomes “Profile”.

### Figures

Four metrics:

- **Value rescued.** Retail value moved into the kitchen instead of the waste bin.
- **Due within 48 hours.** Items still on hand whose lot date is inside the next 48 hours.
- **Inventory value.** On-hand units priced at their stored unit cost.
- **Waste reduction.** Share of handled value that was rescued rather than discarded.

Three charts (`recharts`), colors in `components/admin/chartColors.ts` (ocean `#6E8EAE`, coral `#C4847A`, steel `#8B9AAB`):

- `WasteVsRescueChart` — kitchen-rescue units versus discarded units.
- `RevenueRecoveryChart` — last 7 days. Coral is discarded value. Ocean is value sent to the kitchen.
- `DepartmentAlertsChart` — steel is below the alert level, coral is due within 48 hours. Shared `ChartTooltip`.

Under the charts:

- **Waste right now.** Current waste percent against `targetWastePct` (seed default 2.5%). Green when the store is at or under the target, rose when it is over. Also shows how many items to pull within 3 days.
- **Low stock.** Count of items under their alert level, linking to `/orders`.

`getStoreStats()` in `lib/storeStats.ts` builds this. Results are cached about 20 seconds. Saving store settings calls `invalidateStoreStats()`. Ledger writes call `invalidateLedgerReads()` (60 second stock cache in `lib/ledgerCache.ts`). `GET /api/admin/stats` exposes the same payload.

### Day steps

| Step | Goes to | Copy |
| --- | --- | --- |
| 1 Receive | `/receive` | Read the delivery, turn each case into retail units, and set the floor price. |
| 2 Inventory & floor | `/inventory` | See on-hand stock, pull within 2–4 days, markdown, kitchen rescue, or waste — all ledger-backed. |
| 3 Kitchen | `/kitchen` | Cook rescued product into a prepared item and log scrap buckets. |

### Store settings

`SettingsForm` edits the latest `StoreSetting` row (`PATCH /api/admin/settings`):

- Store name
- Waste target (%)
- Pull window: 2, 3, or 4 days
- Scrap bucket size (litres), default 20
- Trim density (kg per litre), default 0.65
- Scrap cost ($/kg), default 3.50
- Invoice cost alert (%), default 20. A scanned cost that moves more than this versus the known cost is flagged.

Defaults live in `lib/platformSettings.ts` as `PLATFORM_DEFAULTS` when no row exists.

### Staff

`UserManagementTable` lists coworkers. A manager can add a person (name, email, position, role), edit them, remove them, or “Act as” them. The same switcher sits in the shell. `GET` and `POST /api/users`, `PATCH` and `DELETE /api/users/:id`.

### Edit a case

`CaseBoard` with `showReceipt` is the only place that edits a case. It lists in-stock items (search by item or supplier) and a three-column editor:

- **Yield.** Pack size, yield divisor, retail unit (`units`, `quarts`, `lbs`). Pack size ÷ divisor.
- **Floor price.** Target margin presets 35%, 40%, or custom. Current retail price. Live margin.
- **Receipt.** Confirms the case math for the selected item, including supplier.
- **Admin override.** Cases on hand. Units become cases × pack size. This writes a ledger adjustment through `setStockCases`. It is a manager stock correction, not a new delivery.

Saving pack, yield, or price calls `updateCase` and does not receive more product. `GET` and `PATCH /api/inventory/levels`.

## Receive — `/receive`

Step 1. “Price the delivery.”

`ReceiveScreen` loads receiving logs through `loadReceivingLogs()` (`lib/receivingSheet.ts`, sheet name `Receiving_logs`, with sample logs when the sheet is empty). **Scan invoice** opens `InvoiceUploadModal`. A confirmed scan becomes extra cases on the pricing board: vendor, invoice number, and a count of cases ready to price.

`YieldPricingDashboard` is the board. Pick a case and set:

- Pack size and yield divisor (`YieldBreakdown`)
- Receiving details (`ReceivingDetails`): cases received, case cost, supplier context from the log
- Pricing strategy (`PricingStrategy`): margin mode 35 / 40 / custom, retail price
- Retail unit: units, quarts, or lbs
- `PackReceiptCard`: the receipt the clerk confirms before save
- `MarginBadge` and `marginTone`: healthy, thin, or empty

Save posts the receipt (`postReceipt` in `lib/stock.ts`): a `Receive` transaction from `External_Vendor` to `Retail_Floor`, with quantity, unit cost at the time, and a reference id. Posted case ids are remembered in the browser so the same line is not posted twice in that session. Quote math is `calculateYieldQuote` in `lib/yieldPricing.ts`. Shared field pieces: `SectionCard`, `ReadOnlyStat`, `NumberField`, `CurrencyField` in `components/yield/Fields.tsx`.

`YieldWorkflowStepper` is the older step chrome for this flow and is not the live receive page.

## Inventory & floor — `/inventory` and `/inventory/floor`

Step 2. “Inventory & floor management” (unified operations). **`/floor` redirects to `/inventory/floor`.** On-hand quantity from the ledger *is* retail-floor stock; kitchen prep is a separate sub-location on the same SKU.

Both routes use the same transfer stack: `SubInventoryWorkspace` (tabs by role), `RetailFloorTransferPanel` / `KitchenPrepTransferPanel`, and `SubInventoryTransferBar` with explicit quantity (+/−, **All**, unit steps). Moves go through `executeInventoryMove` in `lib/inventoryMoveClient.ts` → `POST /api/inventory/move`.

- **`/inventory`** — Managers and receiving see retail + kitchen tabs (`lib/subInventoryView.ts`). Server-loads `getStockLevels()` via `StoredInventory` → `SlateInventory`.
- **`/inventory/floor`** — Clerks see retail floor only (`FloorTransferPage`): pull slider, flagged short-dated board, full catalog, same move actions.

There is no pack, yield, price, or case editor on these pages (that stays on Admin **Edit a case**).

### Layout

- **Header.** Unified operations eyebrow, title, link to **Ledger** (`/operations`), **Recipes** (`/kitchen`).
- **Metric cards.** Total value at risk (short-dated / low / marked down), on-hand SKU count, markdown count (session), low stock count (link to `/orders`).
- **`PullSliderControl`.** Presets 2, 3, or 4 days. Filters the action board. Does not persist to `StoreSetting.pullSensitivityDays` yet.
- **Short-dated & action board.** Items with `daysRemaining <= pullDays`, under par (`low`), or flagged 30% markdown in the session. Department filter (heuristic from product name) and search by item or supplier.
- **Full on-hand catalog.** Collapsible list of remaining in-stock SKUs with the same row actions.

### Row detail

Each row shows name, supplier, on-hand units and cases, margin, inventory value, days left, and a **Low** badge when under par. Shelf color: coral under 2 days, amber through 7 days.

### Actions (ledger-backed)

Retail-floor actions via `POST /api/inventory/move`:

- **Kitchen** — `action: "rescue"`. Double entry `Retail_Floor` → `Kitchen_Prep`.
- **30% off** — `action: "markdown"`. Persists `regularRetailPrice` and sets `retailPrice` to 70% of the regular shelf price; UI updates price and `MARKDOWN` badge instantly from the returned `level`.
- **Waste** — `action: "waste"`. Negative `Waste` `Retail_Floor` → `Waste_Bin`. Row disappears when on-hand hits zero.

Kitchen-prep actions on the same API:

- **Kitchen waste** — `action: "kitchen_waste"`. `Kitchen_Prep` → `Waste_Bin` (`moveKitchenPrepToWaste` in `lib/stock.ts`).

After a move, `invalidateLedgerReads()` runs on the server; the row updates from the API response. Toasts report units moved.

### Legacy floor UI (not the live path)

`InventoryList`, `GET /api/inventory?pullDays=`, and `PATCH /api/inventory` status updates still exist for older demos. They touch in-memory `inventory_items` in `lib/db.ts` and do **not** write `Rescue` or `Waste` transactions. Do not use them for production floor work — use `/inventory` and confirmed voice logs instead.

`DepartmentBadge`, `StatsOverview`, and `InventoryTable` are earlier views and are not mounted on the live inventory page.

## Kitchen — `/kitchen`

Step 3. “Cook what the floor pulled.”

The hub is “Prepared Foods Recipe Fusion Hub”. It loads `GET /api/recipe-fusion` and falls back to `INITIAL_FUSION_RECIPES` in `lib/mockData.ts`. **Synthesize Recipes** posts the selected category to `/api/recipe-fusion`, which asks Gemini (`processRecipeFusion` in `lib/gemini.ts`) for a recipe from short-dated ingredients: name, category, ingredients used, estimated yield, estimated cost, target retail price, gross margin, instructions, prep time, chef tips, allergens. New cards are prepended. Categories on the filter: All, Soup, Panzanella, Parfait, Bakery. Search matches name or category.

`RecipeFusionCard` shows category, margin, cost, retail price, prep time, ingredients, instructions, chef tips, and allergens. It can expand, and it opens the deli label. A “send to kitchen” flag on the card is local until a production batch is confirmed elsewhere.

`DeliLabelModal` is the printable label: recipe name, price, category, and `window.print()`.

**Voice Transfer** opens `VoiceRecorderModal` (parse-only refresh; commit loop is on `VoiceLoggerModal` from the shell).

`InvoiceUploadModal` is mounted here and is not opened by a visible button.

## Orders — `/orders`

`BuyList` is the supplier buy list, built from `getStockLevels()`.

A line is low when on-hand cases are under `parCases` (default 2, per product). The suggested order is the cases needed to reach par, with a cost of order cases × pack size × unit cost (`stockFromPar` in `lib/parLevel.ts`).

Per line:

- Status: In stock, Order N, Approved, or On order
- Alert level (par cases), saved through the levels API
- Supplier, saved through the levels API
- Add a line that is not low, search, and a quiet section for items that do not need an order
- Approve a line, then mark it sent

`PoEmailPanel` and `components/orders/supplierMail.ts` group lines by supplier, draft a purchase-order email (supplier address helper, case wording, line text), and support print. Marks (approved / sent) live in the page session.

## Full ledger — `/operations`

`OperationsCenter` is the manager command center linked from Admin and from Inventory (Ledger). It is not a nav item.

It shows:

- Header “Yield & Sub-Inventory Control” and a sync control for the ledger.
- **Semáforo KPI de merma.** Waste % = (discard value + volumetric scrap value) / gross sales. Green under the 2.5% target, rose and pulsing when over. Discard value, scrap value, bucket count, and gross sales sit on the card. Bucket count can be nudged +1 / −1 on the card itself.
- **Slider de retiro humano.** 2 days (strict), 3 days (standard), 4 days (early warning). Filters the retail rows that are flagged.
- Location tabs: split view, `Retail_Floor` only, or `Kitchen_Prep` only. Search and a “only pulls” filter.
- **`OperationsLiveTransfers`.** Live `GET /api/inventory/levels` + the same `SubInventoryWorkspace` as Inventory (real writes). Link to **Clerk floor view** (`/inventory/floor`). Refreshes the analytics snapshot on `freshloop-inventory-updated`.
- **Retail_Floor table.** Quantity, moving-average cost, retail price, target margin, yield, days remaining, supplier — read-only analytics (moves happen in the live panel above).
- **Kitchen_Prep table.** The rescued side of the same ledger, with its own value total (read-only analytics).
- `VolumetricScrapForm`. One click logs N buckets. Weight = buckets × 20 L × 0.65 kg/L. Cost = weight × $3.50/kg. Reset clears the count on this screen.
- Active kitchen rescue recipes and a deli-label queue, using `RecipeFusionCard` and `DeliLabelModal`.
- Modals: invoice upload, `VoiceLoggerModal` (the confirm loop), and `RecipeProductionModal`.

The center starts from a snapshot that mirrors the ledger and then refreshes from `GET /api/inventory` (`liveLedger.subInventoryRows`). A transfer toast says the ledger row was recorded. Scrap buckets on this screen update the KPI math in the browser; the durable scrap transaction path is the manufacturing/scrap reference prefix `VOL-SCRAP-BUCKET` in `lib/inventory.ts`.

## Voice

Two recorders exist.

`VoiceLoggerModal` is the one `AppShell` opens from the nav Voice button, and the one Operations uses. Loop:

1. **Capture.** Record or type. Audio goes to `POST /api/voice-logger` for a parse, not a write.
2. **Confirm.** `POST /api/voice-logger` parses with `generateContentWithFallback` and `parseModelJson` (deterministic regex fallback if the model fails). Items carry `PULL_RESCUE` or `DISCARD`. Spoken names are fuzzy-matched to the product catalog; lines with low confidence require picking a product (no default SKU). The clerk can edit the draft.
3. **Commit.** Confirm writes the ledger. Rescue is the double entry `Retail_Floor` → `Kitchen_Prep`. Discard is `Waste` into `Waste_Bin`. `invalidateLedgerReads()` runs after the write. A `VoiceLog` row stores the transcript and parsed JSON.

`VoiceRecorderModal` is the shorter recorder on Kitchen. It posts the voice parse route without the full confirm-and-commit loop.

## Invoice scan

`InvoiceUploadModal` sends an image (or `demo: true`) to `POST /api/invoice-ocr`. Vision extraction uses `generateContentWithFallback` and `parseModelJson` in the route (`extractInvoiceWithGemini15Flash`). The response always sets `requires_confirmation: true` — the OCR path does not post stock.

**Cost guardrail.** Each line is matched to the catalog and compared to `getMovingAverageCost` (with case-vs-unit alignment). Lines beyond `StoreSetting.costGuardrailVariancePct` (default 20%) get `requires_approval` and set `requires_manager_approval` on the invoice. The modal shows variance per line and blocks **Add to receiving** until the manager checks an approval box. Receive still posts through **`POST /api/receiving-logs`** → `postReceipt` (not `confirmCommit` on the OCR API, which exists for optional bulk commit).

`lib/gemini.ts` also exports `processInvoiceOcr` for reuse; the live modal calls the API route above. `VendorInvoice` in the schema can store `rawOcrJson`, department breakdown, and status when that path is wired.

## Manufacturing and recipes

`POST /api/manufacturing` runs a kitchen batch:

- Loads the `Recipe` and its `RecipeBOM` lines.
- Each line has a required quantity, a unit, and `allowVariance`. The cook can send the real weight used when it differs from the bill of materials.
- Ingredients are deducted from `Kitchen_Prep`.
- The finished product is added to the ledger as a manufactured item (`isManufactured`), with batch cost and a batch reference id.
- Output carries portion yield (`batchYieldQty`), target retail price, prep time, instructions, chef tips, and allergens.

`RecipeProductionModal` is that confirm screen: standard quantity versus actual quantity, available kitchen stock, batch cost, and the execute button. It is opened from the operations center.

`Recipe` / `RecipeBOM` are the structured bills of materials. `RecipeFusion` is the AI suggestion table: recipe name, category, `ingredientsUsed` JSON, estimated yield, estimated cost, target retail price, gross margin, instructions, status.

`POST /api/recipe-fusion` generates suggestions. `GET /api/recipe-fusion` lists saved ones. `saveFusionRecipe` and `getFusionRecipes` in `lib/db.ts` back that list.

## Virtual kits and POS

The schema and `executeBundleSale` in `lib/inventory.ts` support a POS bundle. Selling a bundle does not decrement a bundle stock column. It explodes `BundleItem` lines into negative `POS_Sale` transactions for each component, from the source location (default retail floor) toward `Customer_Out`, with an external receipt reference. `POSMapping` ties an internal product or bundle to an external SKU/PLU (`posSystem` default `SQUARE_POS`). There is no POS screen in the app yet. The function is the server-side explode.

## Ledger math — `lib/inventory.ts`

- `getCurrentStock(productId, location?)`. With a location: inflows (`toLocation` and positive qty) plus outflows (`fromLocation` and negative qty). Without a location: sum of all `qtyChange`.
- `getMovingAverageCost(productId)`. Weighted average of `Receive` rows: sum of qty × unit cost at the time, divided by qty. If there are no receipts, it falls back to other positive inflows that carry a cost, then to `Product.standardCost`.
- `calculateRealTimeWastePct()`. `(discard value + volumetric scrap value) / gross sales × 100`. Discard value is absolute qty × unit cost on `Waste` rows. Scrap value is buckets × bucket litres × kg per litre × scrap cost per kg. Gross sales come from `Sale` and `POS_Sale`. The result is the traffic light against `targetWastePct`.
- `executeBundleSale(bundleId, externalRef, options)` as described above.
- Volumetric scrap reference prefix: `VOL-SCRAP-BUCKET`.

`lib/stock.ts` is the page-facing stock layer: `StockLevel`, `getStockLevels` (sum of qty for products that are not manufactured), `buildStockLevel`, `postReceipt`, `moveRetailStock`, `setStockCases`, `setSupplier`, `setParCases`, `updateCase`, `lookupOnHand`, and `matchProduct`.

`lib/units.ts` converts units and computes case-to-retail values and a retail price from a target margin. `STANDARD_RECEIVED_UNITS` and `STANDARD_RETAIL_UNITS` are the unit pick lists.

## Data model

| Model | Table | What it holds |
| --- | --- | --- |
| `User` | `staff_users` | Name, unique email, position, role |
| `Product` | `products` | Barcode, name, department, target margin (default 40%), unit, case pack, par cases, yield %, shelf life days, supplier, origin, standard cost, retail price, `isManufactured` |
| `InventoryTransaction` | `Inventory_Transactions` | Timestamp, product, staff, signed `qtyChange`, type, from, to, unit cost at the time, reference id (invoice, batch, POS receipt, or voice log), expiration date, notes |
| `StoreSetting` | `store_settings` | Store name, waste target, scrap bucket litres, kg per litre, scrap $/kg, pull sensitivity days, invoice variance % |
| `Recipe` | `recipes` | Output product, batch yield, target retail price, prep time, instructions, chef tips, allergens, role restriction, active flag |
| `RecipeBOM` | `recipe_boms` | Ingredient product, required qty, unit, variance allowed, notes. Unique per recipe + ingredient |
| `Bundle` | `bundles` | Name, unique SKU, description, price, discount %, active |
| `BundleItem` | `bundle_items` | Product and quantity deducted when one bundle sells |
| `POSMapping` | `pos_mappings` | External SKU, POS system name, product or bundle |
| `VendorInvoice` | `vendor_invoices` | Vendor, invoice number, date, total, department breakdown JSON, status, raw OCR JSON |
| `InventoryItem` | `inventory_items` | Legacy row with its own quantity and status. The floor status route still talks to this shape. Live stock does not. |
| `VoiceLog` | `voice_logs` | Transcript, audio duration, parsed JSON, target action |
| `RecipeFusion` | `recipe_fusions` | AI recipe suggestion and its costing |

Seed file: `prisma/seed.ts`. Store setting id `store-config-main`. Seed transactions document a rescue (two rows) and a waste (one negative row).

## HTTP API

| Route | Methods | Job |
| --- | --- | --- |
| `/api/users` | GET, POST | List staff. Create a person. |
| `/api/users/:id` | PATCH, DELETE | Update name, email, position, role. Remove a person. |
| `/api/admin/settings` | GET, PATCH | Read and save store settings. Saving clears the stats cache. |
| `/api/admin/stats` | GET | Store statistics payload. |
| `/api/inventory` | GET, PATCH | Floor pull list plus `liveLedger` sub-inventory rows. PATCH updates a legacy inventory-item status. |
| `/api/inventory/levels` | GET, PATCH | Stock levels for Inventory, Orders, and the case editor. PATCH updates par, supplier, case fields, or `action` (`rescue` \| `waste` \| `markdown`) and returns refreshed `level`. |
| `/api/inventory/move` | POST | `rescue`, `waste`, `markdown`, or `kitchen_waste` for one product and quantity. Returns refreshed `StockLevel` (`onHand` = retail floor, `kitchenPrepQty`, prices). |
| `/api/inventory/on-hand` | GET | Name lookup of current on-hand quantity. |
| `/api/receiving-logs` | GET, POST | Receiving sheet rows used by the price-the-delivery board. |
| `/api/invoice-ocr` | POST | Image to invoice JSON, with the cost guardrail. Does not post stock by itself. |
| `/api/voice-logger` | POST | Parse a voice note, or commit a confirmed rescue/waste. |
| `/api/recipe-fusion` | GET, POST | List fusion recipes. Generate a new one from a category. |
| `/api/manufacturing` | POST | Execute a recipe batch against `Kitchen_Prep` and add the finished product. |

## Component index

**Shell and account**

- `AppShell`, `Navigation`, `PageIntro`, `RoleProvider`
- `AccountPage` (`ProfileForm`, `SettingsForm`, `DaySteps`)
- `UserManagementTable`
- `Navbar` (unused older bar)

**Dashboard**

- `DashboardFigures`
- `AdminStats`, `Metric`
- `WasteVsRescueChart`, `RevenueRecoveryChart`, `DepartmentAlertsChart`, `ChartTooltip`, `chartColors`

**Receive and pricing**

- `ReceiveScreen`
- `YieldPricingDashboard`
- `YieldBreakdown`, `PricingStrategy`, `ReceivingDetails`, `PackReceiptCard`, `MarginBadge`, `Fields`
- `YieldWorkflowStepper` (not mounted on the live receive page)
- `InvoiceUploadModal`

**Inventory and cases**

- `StoredInventory`, `SlateInventory` (unified inventory + floor: metrics, pull slider, action board, full catalog)
- `CaseBoard` (`ItemSearch`, `FocusedEditor`, `EditorPanel`, `ReceiptPanel`, `StockOverride`, `ReceiptRow`)
- Legacy floor queue components (`InventoryList`, `InventoryTable`, `StatsOverview`) removed; use `SlateInventory` only.
- `DepartmentBadge`
- `PullSliderControl`
- `app/floor/page.tsx` — redirect to `/inventory/floor`
- `app/inventory/floor/page.tsx` — clerk retail-only transfer page
- `components/operations/OperationsLiveTransfers.tsx` — live sub-inventory moves on Operations

**Kitchen and ledger**
- `VoiceRecorderModal`, `VoiceLoggerModal`
- Kitchen page
- `RecipeFusionCard`, `DeliLabelModal`
- `OperationsCenter`
- `RecipeProductionModal`
- `VolumetricScrapForm`

**Orders**

- `BuyList` (`StatusBadge`, `OrderAmount`, `AlertField`, `SupplierField`, `LineActions`)
- `PoEmailPanel`
- `supplierMail` helpers: `supplierEmail`, `caseWord`, `orderLine`, `openOrderRows`, `approvedOrderRows`, `draftForRows`, `draftForAll`, `groupBySupplier`

## Libraries

| File | Responsibility |
| --- | --- |
| `lib/roles.ts` | Roles, labels, `isManager`, `homeForRole`, `canVisit` |
| `lib/inventory.ts` | Prisma client, stock sum, moving-average cost, bundle explode, waste percent |
| `lib/stock.ts` | Stock levels, receipts, retail moves, case edits, par and supplier updates |
| `lib/ledgerCache.ts` | Short cache of ledger reads and its invalidation |
| `lib/storeStats.ts`, `lib/storeStatsTypes.ts` | Dashboard figures |
| `lib/platformSettings.ts` | Store settings parse, load, and save |
| `lib/yieldPricing.ts` | Pack, yield, margin, currency and unit formatting |
| `lib/parLevel.ts` | Default par of 2 cases and the order quantity that reaches par |
| `lib/units.ts` | Unit conversion and margin price |
| `lib/receivingSheet.ts` | Receiving log load and sample rows |
| `lib/gemini.ts` | `generateContentWithFallback`, `parseModelJson`, invoice OCR helpers, voice parse helpers, recipe fusion, model fallback |
| `lib/types.ts` | Shared UI types for inventory items, invoices, voice, and fusion recipes |
| `lib/db.ts` | Legacy inventory-item and fusion helpers, including the in-memory status update |
| `lib/mockData.ts` | First-paint samples for the floor queue and the kitchen cards |
