# FreshLoop ERP — Connected workflows

End-to-end flow from dock to dollars (aligned with Brynn's Sheets logic).

## 1. Receive → Floor (`/receive`)

1. Configure **pack size**, **yield divisor**, **margin**, **shelf price** on the yield card.
2. `POST /api/receiving-logs` → `postReceipt()` writes:
   - `Product.yieldPct`, `targetMargin`, `standardCost`, `retailPrice`
   - `InventoryTransaction` **Receive**: `External_Vendor` → `Retail_Floor`
3. Uses the signed-in receiver's staff id (not a hardcoded demo user).

**Formula:** `unit cost = case cost ÷ (pack size ÷ yield divisor)` — same as Sheets `InventoryNpricing`.

## 2. Floor → Kitchen / Waste

- **Rescue / waste** from floor: `POST /api/inventory/move` → `moveRetailStock`
- **Voice logger**: confirms moves on matched products
- **Volumetric scrap**: `POST /api/inventory/volumetric-scrap` → `Waste` → `Waste_Bin`

## 3. Production (`/kitchen`)

1. **New Recipe (BOM)** → `POST /api/recipes` (ingredients + labor + packaging).
2. **Execute BOM Batch** → `POST /api/manufacturing`:
   - Consumes ingredients in `Kitchen_Prep`
   - Receives finished goods into **`Deli_Grab_N_Go`** with full batch cost (ingredients + labor + packaging)
   - Marks output `Product.isManufactured = true`

## 4. Sales (POS / floor)

- `POST /api/sales` with `{ productId, quantity }` → **Sale** ledger row (feeds waste KPI denominator).
- Bundle: `{ bundleSku: "BUNDLE-BERRY-TRIO" }` → `executeBundleSale` (**POS_Sale** explode).

## 5. Operations KPI (`/operations`)

- **Waste %** = `(discard $ + volumetric scrap $) ÷ gross sales $`
- Gross sales = sum of **Sale** + **POS_Sale** (negative qty × retail price)
- After seed, demo sales/waste/rescue rows populate the dashboard.

## 6. Admin store settings (`/admin`)

- **Waste target**, scrap bucket, **kitchen labor rate ($/hr)** → `StoreSetting.defaultLaborRatePerHour`
- Used when a recipe has no explicit `laborRate`.

## API quick reference

| Step | API |
|------|-----|
| Receive | `POST /api/receiving-logs` |
| Stock levels | `GET` via pages → `getStockLevels()` |
| Move / waste | `POST /api/inventory/move` |
| Create BOM | `POST /api/recipes` |
| Run batch | `POST /api/manufacturing` |
| Record sale | `POST /api/sales` |
| Waste KPI | `GET /api/inventory` (includes `liveLedger.wasteKpi`) |

Run migrations and seed:

```bash
npx prisma migrate deploy
npm run db:seed
```
