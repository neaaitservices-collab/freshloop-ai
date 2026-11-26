import { Department, InventoryLocation, Prisma, TransactionType, UnitType } from '@prisma/client';
import { departmentIdColumns } from '@/lib/domains/catalog/departmentRef';
import { loadDepartmentCodeMap } from '@/lib/domains/catalog/departmentRefStore';
import { excludeVolumetricScrapFromStock, InventoryLedgerError } from '@/lib/domains/inventory/ledger';
import type { LotTx } from '@/lib/domains/inventory/lots';
import { DEFAULT_PAR_CASES, normalizeParCases } from '@/lib/domains/inventory/parLevel';
import {
  normalizeProductNameForMatch,
  selectPurchaseProductByName,
} from '@/lib/domains/inventory/productMatching';
import {
  productPackWriteData,
  type ProductPackFields,
} from '@/lib/domains/inventory/stock';
import {
  receivingDepartmentRequiredMessage,
  resolveReceivingDepartment,
} from '@/lib/domains/inventory/receivingDepartment';
import {
  normalizeDeliveryUuid,
  receivingDeliveryPayloadHash,
  DELIVERY_PAYLOAD_CONFLICT_ERROR,
  DELIVERY_UUID_REQUIRED_ERROR,
} from '@/lib/domains/receiving/deliveryIdentity';
import { isMissingSupplierProductMatches, normalizeSupplierCode } from '@/lib/domains/receiving/supplierProductMatch';
import { sampleReceivingRejection } from '@/lib/domains/receiving/sampleReceivingGuard';
import {
  isSkippedInvoiceReceipt,
  RECEIPT_COLLISION_REASON,
  type ReceivingLogPostInput,
  type ReceivingLogPostResult,
} from '@/lib/domains/receiving/receivingLogPost';
import { resolveTargetMargin } from '@/lib/domains/receiving/yieldPricing';

export interface InvoiceReceiptSlot {
  posted: boolean;
  transactionId: string;
  productId: string;
  productName: string;
  unitsAdded: number;
  onHand: number;
  department: Department | null;
  casePackSize: number;
  receivePackSize: number;
  splitFactor: number;
  idempotent: boolean;
}

const emptySlot = (): InvoiceReceiptSlot => ({
  posted: false,
  transactionId: '',
  productId: '',
  productName: '',
  unitsAdded: 0,
  onHand: 0,
  department: null,
  casePackSize: 1,
  receivePackSize: 1,
  splitFactor: 1,
  idempotent: false,
});

interface PreparedLine {
  index: number;
  post: ReceivingLogPostInput;
  deliveryId: string;
  pack: ProductPackFields;
  unitsAdded: number;
  unitCost: number;
  hash: string;
}

interface CatalogProduct {
  id: string;
  name: string;
  barcode: string | null;
  department: Department;
  shelfLifeDays: number;
  casePackSize: number;
  receivePackSize: number;
  splitFactor: number;
}

const productSelect = {
  id: true,
  name: true,
  barcode: true,
  department: true,
  shelfLifeDays: true,
  casePackSize: true,
  receivePackSize: true,
  splitFactor: true,
} as const;

function unitTypeFor(retailUnit: string): UnitType {
  return retailUnit === 'lbs' ? UnitType.LBS : UnitType.UNIT;
}

/** Lock every id in one statement. Prisma.join bound this list as jsonb. */
async function lockRows(
  tx: LotTx,
  table: 'products' | 'inventory_lots',
  column: 'id' | 'product_id',
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
  await tx.$queryRawUnsafe(
    `SELECT id FROM ${table} WHERE ${column} IN (${placeholders}) ORDER BY id FOR UPDATE`,
    ...ids
  );
}

function supplierLabel(name: string | null): string {
  return name?.trim() || 'Received at the dock';
}

function skuOf(post: ReceivingLogPostInput): string | null {
  return normalizeSupplierCode(post.supplierCode);
}

function packOf(post: ReceivingLogPostInput): ProductPackFields {
  try {
    return productPackWriteData(post.packSize, post.splitFactor);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Pack size did not produce any retail units.';
    throw new InventoryLedgerError(message, 'DELIVERY_CONFLICT', 409, { committed: false });
  }
}

/**
 * Create missing catalog SKUs and post every payable line in the caller's transaction.
 * One round of writes for the whole invoice, so a long invoice does not outlive the
 * interactive transaction and leave the ledger unchanged.
 */
export async function postInvoiceReceiptBatch(
  tx: LotTx,
  posts: ReceivingLogPostInput[],
  actor: { staffId: string; supplierName: string | null; supplierId?: string | null }
): Promise<{
  slots: InvoiceReceiptSlot[];
  receipts: { transactionId: string; productId: string; unitsAdded: number; onHand: number }[];
  postedRows: ReceivingLogPostResult[];
  catalogUpdates: { id: string; data: Prisma.ProductUpdateInput }[];
}> {
  const slots = posts.map(() => emptySlot());
  const postedRows: ReceivingLogPostResult[] = [];
  const prepared: PreparedLine[] = [];
  const deliveryIds: string[] = [];

  for (const [index, post] of posts.entries()) {
    if (isSkippedInvoiceReceipt(post)) continue;
    const sampleReason = sampleReceivingRejection(post);
    if (sampleReason) {
      throw new InventoryLedgerError(sampleReason, 'DELIVERY_CONFLICT', 409, { committed: false });
    }
    const pack = packOf(post);
    const unitsAdded = Number((post.casesReceived * pack.casePackSize).toFixed(4));
    if (!(unitsAdded > 0)) {
      throw new InventoryLedgerError('Pack size did not produce any retail units.', 'DELIVERY_CONFLICT', 409, {
        committed: false,
      });
    }
    const deliveryId = normalizeDeliveryUuid(post.externalLogId ?? '');
    if (!deliveryId) {
      throw new InventoryLedgerError(DELIVERY_UUID_REQUIRED_ERROR, 'DELIVERY_CONFLICT', 409, { committed: false });
    }
    const unitCost = pack.casePackSize > 0 ? post.caseCost / pack.casePackSize : post.caseCost;
    prepared.push({
      index,
      post,
      deliveryId,
      pack,
      unitsAdded,
      unitCost,
      hash: receivingDeliveryPayloadHash({
        itemName: post.itemName,
        productId: post.productId,
        casesReceived: post.casesReceived,
        caseCost: post.caseCost,
        packSize: post.packSize,
        splitFactor: post.splitFactor,
      }),
    });
    deliveryIds.push(deliveryId);
  }

  const heldRows = deliveryIds.length
    ? await tx.supplierInvoiceLine.findMany({
        where: { id: { in: deliveryIds }, heldByLegacy: true },
        select: { id: true },
      })
    : [];
  const held = new Set(heldRows.map((row) => row.id));
  const existingRows = deliveryIds.length
    ? await tx.receivingDelivery.findMany({ where: { id: { in: deliveryIds } } })
    : [];
  const existing = new Map(existingRows.map((row) => [row.id, row]));

  const work: PreparedLine[] = [];
  for (const line of prepared) {
    if (held.has(line.deliveryId)) {
      const productId = line.post.productId?.trim() || '';
      slots[line.index] = {
        ...emptySlot(),
        posted: true,
        idempotent: true,
        productId,
        productName: line.post.itemName,
      };
      postedRows.push({
        externalLogId: line.post.externalLogId,
        itemName: line.post.itemName,
        stock: {
          posted: true,
          idempotent: true,
          unitsAdded: 0,
          onHand: 0,
          productId,
          productName: line.post.itemName,
          transactionId: '',
          reason: 'This invoice was already received before the upgrade. Stock was not added again.',
        },
      });
      continue;
    }
    const prior = existing.get(line.deliveryId);
    if (prior) {
      if (prior.payloadHash !== line.hash) {
        throw new InventoryLedgerError(DELIVERY_PAYLOAD_CONFLICT_ERROR, 'DELIVERY_CONFLICT', 409, {
          committed: false,
          results: posts.slice(0, line.index + 1).map((row, index) => ({
            externalLogId: row.externalLogId,
            itemName: row.itemName,
            stock:
              index === line.index
                ? { posted: false, conflict: true, reason: DELIVERY_PAYLOAD_CONFLICT_ERROR }
                : {
                    posted: false,
                    reason: 'Rolled back because a later line conflicted. Stock was not added for this line.',
                  },
          })),
        });
      }
      const productId = prior.catalogProductId ?? '';
      slots[line.index] = {
        ...emptySlot(),
        posted: true,
        idempotent: true,
        transactionId: prior.transactionId ?? '',
        productId,
        productName: prior.productName,
        unitsAdded: prior.unitsAdded,
      };
      postedRows.push({
        externalLogId: line.post.externalLogId,
        itemName: line.post.itemName,
        stock: {
          posted: true,
          idempotent: true,
          productId,
          productName: prior.productName,
          unitsAdded: prior.unitsAdded,
          onHand: 0,
          transactionId: prior.transactionId ?? '',
        },
      });
      continue;
    }
    work.push(line);
  }

  if (work.length === 0) {
    return { slots, receipts: slots.map(receiptOf), postedRows, catalogUpdates: [] };
  }

  const explicitIds = [
    ...new Set(work.map((line) => line.post.productId?.trim()).filter((id): id is string => Boolean(id))),
  ];
  const skus = [...new Set(work.map((line) => skuOf(line.post)).filter((sku): sku is string => Boolean(sku)))];
  const supplierId = actor.supplierId?.trim() ?? '';
  const [explicitRows, catalogRows, departmentIds, setting, codeLinks] = await Promise.all([
    explicitIds.length
      ? tx.product.findMany({ where: { id: { in: explicitIds }, isManufactured: false }, select: productSelect })
      : Promise.resolve([]),
    tx.product.findMany({ where: { isManufactured: false }, select: productSelect }),
    loadDepartmentCodeMap(tx),
    tx.storeSetting.findFirst({ orderBy: { updatedAt: 'desc' }, select: { defaultParCases: true } }),
    supplierId && skus.length
      ? tx.supplierProductMatch
          .findMany({
            where: {
              supplierId,
              matchType: 'code',
              matchKey: { in: skus },
              product: { isManufactured: false },
            },
            select: { matchKey: true, product: { select: productSelect } },
          })
          .catch((error: unknown) => {
            if (isMissingSupplierProductMatches(error)) return [];
            throw error;
          })
      : Promise.resolve([]),
  ]);
  const byId = new Map<string, CatalogProduct>();
  const nameCatalog: { id: string; name: string }[] = [];
  for (const row of catalogRows) {
    const product = normalizeProduct(row);
    byId.set(product.id, product);
    nameCatalog.push({ id: product.id, name: product.name });
  }
  for (const row of explicitRows) {
    const product = normalizeProduct(row);
    if (!byId.has(product.id)) {
      byId.set(product.id, product);
      nameCatalog.push({ id: product.id, name: product.name });
    }
  }
  const byCode = new Map<string, CatalogProduct>();
  for (const link of codeLinks) {
    const product = normalizeProduct(link.product);
    byId.set(product.id, product);
    byCode.set(link.matchKey, product);
  }
  const parCases = normalizeParCases(setting?.defaultParCases ?? DEFAULT_PAR_CASES);
  const label = supplierLabel(actor.supplierName);

  const creates = new Map<string, Prisma.ProductCreateManyInput>();
  const assignment = new Map<number, { key: string; existing: CatalogProduct | null }>();
  const keyByBarcode = new Map<string, string>();
  const keyByName = new Map<string, string>();
  for (const line of work) {
    const explicit = line.post.productId?.trim() || '';
    const known = explicit ? byId.get(explicit) : undefined;
    if (known) {
      assignment.set(line.index, { key: `id:${known.id}`, existing: known });
      continue;
    }
    const sku = skuOf(line.post);
    const linked = sku ? byCode.get(sku) : undefined;
    if (linked) {
      assignment.set(line.index, { key: `id:${linked.id}`, existing: linked });
      continue;
    }
    const pendingSku = sku ? `pending:sku:${sku}` : '';
    if (pendingSku && creates.has(pendingSku)) {
      assignment.set(line.index, { key: pendingSku, existing: null });
      continue;
    }
    const named = selectPurchaseProductByName(line.post.itemName, nameCatalog);
    const namedProduct = named ? byId.get(named.id) : undefined;
    if (namedProduct) {
      assignment.set(line.index, { key: `id:${namedProduct.id}`, existing: namedProduct });
      continue;
    }
    const pendingName = `pending:name:${normalizeProductNameForMatch(line.post.itemName) || line.index}`;
    if (creates.has(pendingName)) {
      assignment.set(line.index, { key: pendingName, existing: null });
      continue;
    }
    const department = departmentFor(line, actor.supplierName);
    const key = pendingSku || pendingName;
    assignment.set(line.index, { key, existing: null });
    creates.set(key, economicsOf(line, label, parCases, department, departmentIds, sku));
    if (sku) keyByBarcode.set(sku, key);
    keyByName.set(line.post.itemName.trim().toLowerCase(), key);
  }

  const createdRows = creates.size
    ? await orConfirmAgain(
        () =>
          tx.product.createManyAndReturn({
            data: [...creates.values()],
            select: productSelect,
          }),
        work
      )
    : [];
  const createdByKey = new Map<string, CatalogProduct>();
  for (const row of createdRows) {
    const product = normalizeProduct(row);
    const sku = normalizeSupplierCode(product.barcode);
    const key = (sku && keyByBarcode.get(sku)) || keyByName.get(product.name.trim().toLowerCase());
    if (key) createdByKey.set(key, product);
  }

  const productFor = (index: number): CatalogProduct => {
    const assigned = assignment.get(index);
    if (!assigned) {
      throw new InventoryLedgerError('A saved invoice line was missing.', 'LINE_MISMATCH', 409, { committed: false });
    }
    if (assigned.existing) return assigned.existing;
    const created = createdByKey.get(assigned.key);
    if (!created) {
      throw new InventoryLedgerError('A new catalog item could not be saved.', 'DELIVERY_CONFLICT', 409, {
        committed: false,
      });
    }
    return created;
  };

  const products = new Map<string, CatalogProduct>();
  for (const line of work) {
    const product = productFor(line.index);
    products.set(product.id, product);
  }
  const productIds = [...products.keys()];
  await lockRows(tx, 'products', 'id', productIds);
  await lockRows(tx, 'inventory_lots', 'product_id', productIds);

  const staffId = actor.staffId.trim() || 'staff-receiver-01';
  const now = Date.now();
  const transactionRows = work.map((line) => {
    const product = productFor(line.index);
    const shelfDays = product.shelfLifeDays > 0 ? product.shelfLifeDays : 7;
    return {
      productId: product.id,
      staffId,
      qtyChange: line.unitsAdded,
      transactionType: TransactionType.Receive,
      fromLocation: InventoryLocation.External_Vendor,
      toLocation: InventoryLocation.Retail_Floor,
      unitCostAtTime: Number(line.unitCost.toFixed(4)),
      referenceId: `recv:${line.deliveryId}`,
      expirationDate: new Date(now + shelfDays * 24 * 60 * 60 * 1000),
      notes: `Received ${line.post.casesReceived} cases of ${line.post.itemName}`,
    };
  });
  const transactions = await orConfirmAgain(
    () =>
      tx.inventoryTransaction.createManyAndReturn({
        data: transactionRows,
        select: { id: true, referenceId: true },
      }),
    work
  );
  const transactionByRef = new Map(
    transactions.flatMap((row) => (row.referenceId ? [[row.referenceId, row.id] as const] : []))
  );

  await tx.inventoryLot.createMany({
    data: work.map((line) => {
      const product = productFor(line.index);
      const referenceId = `recv:${line.deliveryId}`;
      const transactionId = transactionByRef.get(referenceId);
      if (!transactionId) {
        throw new InventoryLedgerError('A receipt was not recorded.', 'DELIVERY_CONFLICT', 409, { committed: false });
      }
      const shelfDays = product.shelfLifeDays > 0 ? product.shelfLifeDays : 7;
      return {
        productId: product.id,
        location: InventoryLocation.Retail_Floor,
        qtyRemaining: line.unitsAdded,
        unitCostAtTime: Number(line.unitCost.toFixed(4)),
        expirationDate: new Date(now + shelfDays * 24 * 60 * 60 * 1000),
        receiveReferenceId: referenceId,
        receiveTransactionId: transactionId,
      };
    }),
  });

  await orConfirmAgain(
    () =>
      tx.receivingDelivery.createMany({
    data: work.map((line) => {
      const product = productFor(line.index);
      const referenceId = `recv:${line.deliveryId}`;
      return {
        id: line.deliveryId,
        payloadHash: line.hash,
        itemName: line.post.itemName,
        productId: line.post.productId?.trim() || null,
        casesReceived: line.post.casesReceived,
        caseCost: line.post.caseCost,
        packSize: line.post.packSize,
        splitFactor: line.post.splitFactor,
        unitsAdded: line.unitsAdded,
        transactionId: transactionByRef.get(referenceId) ?? null,
        catalogProductId: product.id,
        productName: product.name,
      };
    }),
      }),
    work
  );
  await orConfirmAgain(
    () =>
      tx.ledgerIdempotencyKey.createMany({
        data: work.map((line) => ({ key: `recv:${line.deliveryId}` })),
      }),
    work
  );

  const catalogUpdates: { id: string; data: Prisma.ProductUpdateInput }[] = [];
  const seenUpdates = new Set<string>();
  for (const line of work) {
    const product = productFor(line.index);
    if (createdByKeyHas(createdByKey, product.id) || seenUpdates.has(product.id)) continue;
    seenUpdates.add(product.id);
    const caseRetail =
      line.post.caseRetailPrice != null && line.post.caseRetailPrice > 0 ? line.post.caseRetailPrice : undefined;
    catalogUpdates.push({
      id: product.id,
      data: {
        ...line.pack,
        unitType: unitTypeFor(line.post.retailUnit),
        standardCost: Number(line.unitCost.toFixed(4)),
        receiveCaseCost: Number(line.post.caseCost.toFixed(4)),
        supplier: label,
        ...(line.post.currentRetailPrice > 0 ? { retailPrice: line.post.currentRetailPrice } : {}),
        ...(caseRetail !== undefined ? { caseRetailPrice: caseRetail } : {}),
        targetMargin: resolveTargetMargin(line.post.marginMode, line.post.customMarginPercent ?? 0),
        catalogActive: true,
      },
    });
  }

  const sums = await tx.inventoryTransaction.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds }, AND: [excludeVolumetricScrapFromStock()] },
    _sum: { qtyChange: true },
  });
  const onHand = new Map(sums.map((row) => [row.productId, Number((row._sum.qtyChange ?? 0).toFixed(4))]));

  for (const line of work) {
    const product = productFor(line.index);
    const transactionId = transactionByRef.get(`recv:${line.deliveryId}`) ?? '';
    const hand = onHand.get(product.id) ?? line.unitsAdded;
    slots[line.index] = {
      posted: true,
      transactionId,
      productId: product.id,
      productName: product.name,
      unitsAdded: line.unitsAdded,
      onHand: hand,
      department: product.department,
      casePackSize: line.pack.casePackSize,
      receivePackSize: line.pack.receivePackSize,
      splitFactor: line.pack.splitFactor,
      idempotent: false,
    };
    postedRows.push({
      externalLogId: line.post.externalLogId,
      itemName: line.post.itemName,
      stock: {
        posted: true,
        productId: product.id,
        productName: product.name,
        unitsAdded: line.unitsAdded,
        onHand: hand,
        transactionId,
      },
    });
  }

  return { slots, receipts: slots.map(receiptOf), postedRows, catalogUpdates };
}

function receiptOf(slot: InvoiceReceiptSlot): {
  transactionId: string;
  productId: string;
  unitsAdded: number;
  onHand: number;
} {
  return {
    transactionId: slot.transactionId,
    productId: slot.productId,
    unitsAdded: slot.unitsAdded,
    onHand: slot.onHand,
  };
}

function normalizeProduct(row: {
  id: string;
  name: string;
  barcode: string | null;
  department: Department;
  shelfLifeDays: number;
  casePackSize: number | null;
  receivePackSize: number | null;
  splitFactor: number | null;
}): CatalogProduct {
  return {
    id: row.id,
    name: row.name,
    barcode: row.barcode,
    department: row.department,
    shelfLifeDays: row.shelfLifeDays,
    casePackSize: row.casePackSize && row.casePackSize > 0 ? row.casePackSize : 1,
    receivePackSize: row.receivePackSize && row.receivePackSize > 0 ? row.receivePackSize : 1,
    splitFactor: row.splitFactor && row.splitFactor > 0 ? row.splitFactor : 1,
  };
}

function departmentFor(line: PreparedLine, supplierName: string | null): Department {
  const department = resolveReceivingDepartment({
    itemName: line.post.itemName,
    explicitDepartment: line.post.department,
    departmentAssumed: line.post.departmentAssumed,
    supplier: supplierName,
    category: line.post.category,
    screenDepartment: line.post.screenDepartment,
  });
  if (!department) {
    throw new InventoryLedgerError(receivingDepartmentRequiredMessage(line.post.itemName), 'DEPARTMENT_REQUIRED', 400, {
      committed: false,
    });
  }
  return department;
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

function collisionError(lines: PreparedLine[]): InventoryLedgerError {
  return new InventoryLedgerError(RECEIPT_COLLISION_REASON, 'DELIVERY_CONFLICT', 409, {
    committed: false,
    results: lines.map((line) => ({
      externalLogId: line.post.externalLogId,
      itemName: line.post.itemName,
      stock: { posted: false, conflict: true, reason: RECEIPT_COLLISION_REASON },
    })),
  });
}

async function orConfirmAgain<T>(run: () => Promise<T>, lines: PreparedLine[]): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isUniqueConflict(error)) throw collisionError(lines);
    throw error;
  }
}

function economicsOf(
  line: PreparedLine,
  label: string,
  parCases: number,
  department: Department,
  departmentIds: Map<string, string> | null,
  sku: string | null
): Prisma.ProductCreateManyInput {
  return {
    name: line.post.itemName.trim(),
    ...(sku ? { barcode: sku } : {}),
    department,
    ...departmentIdColumns(department, departmentIds),
    unitType: unitTypeFor(line.post.retailUnit),
    casePackSize: line.pack.casePackSize,
    receivePackSize: line.pack.receivePackSize,
    splitFactor: line.pack.splitFactor,
    standardCost: Number(line.unitCost.toFixed(4)),
    receiveCaseCost: Number(line.post.caseCost.toFixed(4)),
    ...(line.post.caseRetailPrice != null && line.post.caseRetailPrice > 0
      ? { caseRetailPrice: line.post.caseRetailPrice }
      : {}),
    supplier: label,
    shelfLifeDays: 7,
    parCases,
    isManufactured: false,
    catalogActive: true,
    targetMargin: resolveTargetMargin(line.post.marginMode, line.post.customMarginPercent ?? 0),
  };
}

function createdByKeyHas(createdByKey: Map<string, CatalogProduct>, productId: string): boolean {
  for (const product of createdByKey.values()) {
    if (product.id === productId) return true;
  }
  return false;
}
