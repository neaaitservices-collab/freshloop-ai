import { Department } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';

export interface CatalogProductRow {
  id: string;
  name: string;
  barcode: string | null;
  department: Department;
  casePackSize: number;
  standardCostPerUnit: number;
  standardCostPerCase: number;
}

/** Active purchasable catalog for the receive product picker. Blank query returns the first page. */
export async function searchActiveCatalog(query: string, limit = 20): Promise<Array<{ id: string; name: string }>> {
  const q = query.trim().slice(0, 80);
  const take = Math.min(20, Math.max(1, limit));
  return prisma.product.findMany({
    where: {
      catalogActive: true,
      isManufactured: false,
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
    },
    orderBy: { name: 'asc' },
    take,
    select: { id: true, name: true },
  });
}

/** Live product catalog for OCR/voice matching (no in-memory demo fallback). */
export async function loadProductCatalog(): Promise<CatalogProductRow[]> {
  const dbProducts = await prisma.product.findMany({
    where: { isManufactured: false, catalogActive: true },
    orderBy: { name: 'asc' },
  });
  return dbProducts.map((p) => {
    const pack = p.casePackSize && p.casePackSize > 0 ? p.casePackSize : 1;
    const unitStd = p.standardCost ?? 0;
    return {
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      department: p.department,
      casePackSize: pack,
      standardCostPerUnit: unitStd,
      standardCostPerCase: Number((unitStd * pack).toFixed(2)),
    };
  });
}
