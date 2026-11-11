# Supplier activity (MVP)

One store per database. Shown in the supplier detail sheet at `/admin/suppliers`.

## Event types
| Type | Source | Fields |
|---|---|---|
| PRICE_CHANGE | Auto, on invoice confirm | product, oldCost, newCost, % change, invoice |
| CREDIT | Manual | amount, invoiceRef, reason (SHORT, DAMAGED, QUALITY, PRICING, OTHER), creditStatus OPEN or RECEIVED, resolvedAt |
| SHORT_SHIP | Manual | product?, qty?, invoiceRef?, note |
| QUALITY_REJECT | Manual | product?, qty?, invoiceRef?, note |
| LATE_DELIVERY | Manual | invoiceRef?, note |
| NOTE | Manual | note |

PRICE_CHANGE is written only when the new unit cost differs by the store setting `priceChangeThresholdPct` (default 8%) or more from the last confirmed cost for the same product from the same supplier. Managers and Admins can edit that setting in Settings in PR 2 or 3. There is no row for a product's first invoice.

Existing `PriceVarianceLog` and `SupplierQualityEvent` rows show in the timeline as read-only. They are never copied into this table.

## Who can add
- RECEIVING_CLERK: alerts (SHORT_SHIP, QUALITY_REJECT, LATE_DELIVERY) and NOTE.
- STORE_MANAGER and ADMIN: everything above, plus CREDIT, and marking a credit RECEIVED.
- Rows are never deleted. ADMIN can void a row, with a reason. Automatic rows can't be edited.

## Sheet UI
- Timeline, newest first, 20 rows per page with "Load more". Times in Toronto time.
- Filter chips: All, Price, Credits, Alerts.
- Header shows "Open credits $X (n)", counting only rows that are not voided.
- "Add" button shown by role, opening a small form validated per type.

## Table: SupplierActivity
id, supplierId (link to Supplier, cascade), type, productId?, vendorInvoiceId?, invoiceRef?, amount?, oldCost?, newCost?, qty?, reason?, creditStatus?, resolvedAt?, note?, actorId?, source (AUTO or MANUAL), voidedAt?, voidReason?, createdAt.
Indexes: (supplierId, createdAt), (supplierId, type, creditStatus).

## Out of scope
Multiple stores, emails to suppliers, credit approval workflow, attachments, accounting sync, supplier scorecards, editing automatic rows, backfilling past history.

## PRs
1. Spec, table, enums and migration.
2. Timeline and manual add form.
3. Automatic PRICE_CHANGE on invoice confirm.
