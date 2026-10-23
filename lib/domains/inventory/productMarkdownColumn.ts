import { prisma } from '@/lib/domains/inventory/ledger';

let markdownColumnReady: Promise<void> | null = null;

/** Idempotent: adds products.regularRetailPrice when migration was not applied yet. */
export function ensureProductMarkdownColumn(): Promise<void> {
  if (!markdownColumnReady) {
    markdownColumnReady = prisma
      .$executeRawUnsafe(
        'ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "regularRetailPrice" DOUBLE PRECISION;'
      )
      .then(() => undefined)
      .catch((error: unknown) => {
        markdownColumnReady = null;
        throw error;
      });
  }
  return markdownColumnReady;
}

export async function readProductRetailPrices(
  productId: string
): Promise<{ retailPrice: number | null; regularRetailPrice: number | null }> {
  await ensureProductMarkdownColumn();
  const rows = await prisma.$queryRaw<
    Array<{ retailPrice: number | null; regularRetailPrice: number | null }>
  >`
    SELECT "retailPrice", "regularRetailPrice"
    FROM products
    WHERE id = ${productId}
    LIMIT 1
  `;
  const row = rows[0];
  return {
    retailPrice: row?.retailPrice ?? null,
    regularRetailPrice: row?.regularRetailPrice ?? null,
  };
}

export async function writeProductMarkdownPrices(
  productId: string,
  regularRetailPrice: number,
  retailPrice: number
): Promise<void> {
  await ensureProductMarkdownColumn();
  await prisma.$executeRaw`
    UPDATE products
    SET
      "regularRetailPrice" = ${regularRetailPrice},
      "retailPrice" = ${retailPrice},
      "updatedAt" = NOW()
    WHERE id = ${productId}
  `;
}
