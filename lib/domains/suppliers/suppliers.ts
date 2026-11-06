import { prisma } from '@/lib/domains/inventory/ledger';
import type { Prisma } from '@prisma/client';

export interface SupplierRecord {
  id: string;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

function normalizeSupplierName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function toSupplierRecord(row: {
  id: string;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SupplierRecord {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listSuppliers(): Promise<SupplierRecord[]> {
  const rows = await prisma.supplier.findMany({
    orderBy: { name: 'asc' },
  });
  return rows.map(toSupplierRecord);
}

export async function upsertSupplierByName(
  input: {
    name: string;
    contactName?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
  },
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<SupplierRecord> {
  const name = normalizeSupplierName(input.name);
  if (!name) {
    throw new Error('Supplier name is required.');
  }
  const contactName =
    input.contactName === undefined ? null : input.contactName?.trim() || null;
  const contactPhone =
    input.contactPhone === undefined ? null : input.contactPhone?.trim() || null;
  const contactEmail =
    input.contactEmail === undefined ? null : input.contactEmail?.trim() || null;

  const row = await db.supplier.upsert({
    where: { name },
    create: {
      name,
      contactName,
      contactPhone,
      contactEmail,
    },
    update: {
      ...(input.contactName !== undefined ? { contactName } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone } : {}),
      ...(input.contactEmail !== undefined ? { contactEmail } : {}),
    },
  });
  return toSupplierRecord(row);
}

/** Match OCR / invoice vendor text to a global supplier row (creates if missing). */
export async function getSupplierNameById(supplierId: string): Promise<string | null> {
  const row = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { name: true },
  });
  return row?.name ?? null;
}

export async function resolveSupplierIdForVendorName(
  vendorName: string,
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<string | null> {
  const name = normalizeSupplierName(vendorName);
  if (!name) return null;
  const supplier = await upsertSupplierByName({ name }, db);
  return supplier.id;
}
