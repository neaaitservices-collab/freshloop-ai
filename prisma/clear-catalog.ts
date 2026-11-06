/**
 * Wipe catalog, stock ledger, invoices, and receiving data.
 * Keeps: users, stores, store settings, suppliers.
 *
 * Usage: npx tsx prisma/clear-catalog.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing catalog & inventory (keeping users, store settings, suppliers)…');

  await prisma.$transaction(async (tx) => {
    await tx.recipeFusion.deleteMany();
    await tx.recipeBOM.deleteMany();
    await tx.recipe.deleteMany();
    await tx.floorBundlePromo.deleteMany();
    await tx.bundleItem.deleteMany();
    await tx.bundle.deleteMany();
    await tx.pOSMapping.deleteMany();
    await tx.invoiceLineItem.deleteMany();
    await tx.vendorInvoice.deleteMany();
    await tx.inventoryItem.deleteMany();
    await tx.receivingDisposition.deleteMany();
    await tx.markdownEvent.deleteMany();
    await tx.inventoryLot.deleteMany();
    await tx.inventoryTransaction.deleteMany();
    const products = await tx.product.deleteMany();
    console.log(`  Deleted ${products.count} products (+ related ledger/invoices).`);
  });

  console.log('Done. Admin catalog is empty — scan a new invoice on Receive.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
