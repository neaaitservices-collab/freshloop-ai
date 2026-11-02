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
