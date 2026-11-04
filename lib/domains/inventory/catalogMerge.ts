import { InventoryLocation, TransactionType } from '@prisma/client';
import { getMovingAverageCost, prisma } from '@/lib/domains/inventory/ledger';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import {
  consumeLotsFifo,
  createLotOnReceive,
  readLocationOnHand,
} from '@/lib/domains/inventory/lots';
import {
  catalogDuplicateScore,
  catalogNamePreference,
} from '@/lib/domains/inventory/productMatching';

const CONSOL_TX = { maxWait: 15_000, timeout: 45_000 } as const;

const CONSOL_LOCATIONS: InventoryLocation[] = [
  InventoryLocation.Retail_Floor,
  InventoryLocation.Kitchen_Prep,
  InventoryLocation.Deli_Grab_N_Go,
  InventoryLocation.Main_Storage,
];

export type CatalogProductRef = {
  id: string;
  name: string;
  department: string;
  onHand?: number;
  catalogActive?: boolean;
};

export type DuplicateCatalogGroup = {
  primaryId: string;
  primaryName: string;
  members: Array<{ id: string; name: string; onHand: number }>;
  matchScore: number;
};

function pairMatchScore(a: CatalogProductRef, b: CatalogProductRef): number {
  if (a.department !== b.department) return 0;
  return Math.max(catalogDuplicateScore(a.name, b.name), catalogDuplicateScore(b.name, a.name));
}

export function pickPrimaryProduct(members: CatalogProductRef[]): CatalogProductRef {
  return [...members].sort((a, b) => {
    const pref = catalogNamePreference(b.name) - catalogNamePreference(a.name);
    if (pref !== 0) return pref;
    const stock = (b.onHand ?? 0) - (a.onHand ?? 0);
    if (stock !== 0) return stock;
    if (Boolean(b.catalogActive) !== Boolean(a.catalogActive)) {
      return Number(Boolean(b.catalogActive)) - Number(Boolean(a.catalogActive));
    }
    return a.name.localeCompare(b.name);
  })[0];
}

/** Cluster purchasable SKUs that describe the same item (invoice vs catalog naming). */
export function findDuplicateCatalogGroups(
  products: CatalogProductRef[],
  minScore = 85
): DuplicateCatalogGroup[] {
  const purchasable = products.filter((p) => p.id && p.name.trim());
  const parent = new Map<string, string>();

  function find(id: string): string {
    const parentId = parent.get(id);
    if (!parentId || parentId === id) return id;
    const root = find(parentId);
    parent.set(id, root);
    return root;
  }

  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  }

  for (let i = 0; i < purchasable.length; i++) {
    for (let j = i + 1; j < purchasable.length; j++) {
      const score = pairMatchScore(purchasable[i], purchasable[j]);
      if (score >= minScore) union(purchasable[i].id, purchasable[j].id);
    }
  }

  const buckets = new Map<string, CatalogProductRef[]>();
  for (const product of purchasable) {
    const root = find(product.id);
    const list = buckets.get(root) ?? [];
    list.push(product);
    buckets.set(root, list);
  }

  const groups: DuplicateCatalogGroup[] = [];
  for (const members of buckets.values()) {
    if (members.length < 2) continue;
    const primary = pickPrimaryProduct(members);
    const duplicates = members.filter((m) => m.id !== primary.id);
    let bestPair = minScore;
    for (const dup of duplicates) {
      bestPair = Math.max(bestPair, pairMatchScore(primary, dup));
    }
    groups.push({
      primaryId: primary.id,
      primaryName: primary.name,
      matchScore: Number(bestPair.toFixed(1)),
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        onHand: Number(m.onHand ?? 0),
      })),
    });
  }

  return groups.sort((a, b) => b.members.length - a.members.length || a.primaryName.localeCompare(b.primaryName));
}

async function assertConsolidateAllowed(primaryId: string, sourceIds: string[]) {
  const ids = [primaryId, ...sourceIds];
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, isManufactured: true, department: true },
  });
  if (products.length !== ids.length) {
    throw new Error('One or more products were not found.');
  }
  if (products.some((p) => p.isManufactured)) {
    throw new Error('Manufactured SKUs cannot be consolidated.');
  }
  const primary = products.find((p) => p.id === primaryId);
  if (!primary) throw new Error('Primary product not found.');
  const dept = primary.department;
  if (products.some((p) => p.department !== dept)) {
    throw new Error('Consolidation group must share the same department.');
  }
}

async function resolveUnitCost(productId: string, fallback: number | null): Promise<number> {
  try {
    const mac = await getMovingAverageCost(productId);
    if (mac > 0) return Number(mac.toFixed(4));
  } catch {
    /* use fallback */
  }
  if (fallback && fallback > 0) return Number(fallback.toFixed(4));
  return 0;
}

/** Fast path: move on-hand qty to the primary SKU and hide duplicates (no full ledger rewrite). */
export async function mergeCatalogProducts(input: {
  primaryId: string;
  mergeProductIds: string[];
  staffId: string;
}): Promise<{ primaryId: string; mergedIds: string[]; unitsMoved: number }> {
  const primaryId = input.primaryId.trim();
  const mergeProductIds = [...new Set(input.mergeProductIds.map((id) => id.trim()).filter(Boolean))].filter(
    (id) => id !== primaryId
  );
  if (mergeProductIds.length === 0) {
    throw new Error('Select at least one duplicate SKU to combine with the primary.');
  }

  await assertConsolidateAllowed(primaryId, mergeProductIds);

  const primary = await prisma.product.findUnique({
    where: { id: primaryId },
    select: { id: true, name: true, standardCost: true, shelfLifeDays: true },
  });
  if (!primary) throw new Error('Primary product not found.');

  const sources = await prisma.product.findMany({
    where: { id: { in: mergeProductIds } },
    select: { id: true, name: true, standardCost: true, shelfLifeDays: true },
  });

  const actor = input.staffId.trim() || 'staff-admin';
  let unitsMoved = 0;

  await prisma.$transaction(async (tx) => {
    for (const source of sources) {
      const unitCost = await resolveUnitCost(source.id, source.standardCost);
      const shelfDays = source.shelfLifeDays > 0 ? source.shelfLifeDays : 7;
      const expirationDate = new Date(Date.now() + shelfDays * 24 * 60 * 60 * 1000);

      for (const location of CONSOL_LOCATIONS) {
        const qty = await readLocationOnHand(tx, source.id, location);
        if (!(qty > 0.0001)) continue;

        const referenceId = `CONSOL-${source.id.slice(0, 8)}-${location}-${Date.now()}`;
        const noteOut = `Catalog consolidate: moved ${qty} to ${primary.name}`;
        const noteIn = `Catalog consolidate: received ${qty} from ${source.name}`;

        await consumeLotsFifo(tx, {
          productId: source.id,
          location,
          qty,
          unitCost,
        });

        const outTx = await tx.inventoryTransaction.create({
          data: {
            productId: source.id,
            staffId: actor,
            qtyChange: -qty,
            transactionType: TransactionType.Rescue,
            fromLocation: location,
            toLocation: InventoryLocation.Main_Storage,
            unitCostAtTime: unitCost,
            referenceId,
            notes: noteOut,
          },
        });

        await createLotOnReceive(tx, {
          productId: primaryId,
          location,
          qty,
          unitCostAtTime: unitCost,
          expirationDate,
          receiveReferenceId: referenceId,
          receiveTransactionId: outTx.id,
        });

        await tx.inventoryTransaction.create({
          data: {
            productId: primaryId,
            staffId: actor,
            qtyChange: qty,
            transactionType: TransactionType.Receive,
            fromLocation: InventoryLocation.External_Vendor,
            toLocation: location,
            unitCostAtTime: unitCost,
            referenceId,
            expirationDate,
            notes: noteIn,
          },
        });

        unitsMoved = Number((unitsMoved + qty).toFixed(4));
      }

      await tx.product.update({
        where: { id: source.id },
        data: { catalogActive: false },
      });
    }

    await tx.product.update({
      where: { id: primaryId },
      data: { catalogActive: true },
    });
  }, CONSOL_TX);

  invalidateInventoryCaches();
  return { primaryId, mergedIds: mergeProductIds, unitsMoved };
}

export async function listDuplicateCatalogGroups(): Promise<DuplicateCatalogGroup[]> {
  const rows = await prisma.product.findMany({
    where: { isManufactured: false },
    select: { id: true, name: true, department: true, catalogActive: true },
    orderBy: { name: 'asc' },
  });

  const stockRows = await prisma.inventoryTransaction.groupBy({
    by: ['productId'],
    _sum: { qtyChange: true },
  });
  const onHandByProduct = new Map(
    stockRows.map((row) => [row.productId, Number((row._sum.qtyChange ?? 0).toFixed(2))])
  );

  const refs: CatalogProductRef[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    department: row.department,
    catalogActive: row.catalogActive,
    onHand: onHandByProduct.get(row.id) ?? 0,
  }));

  return findDuplicateCatalogGroups(refs);
}
