/**
 * FreshLoop AI — Phase 1 seed
 * Populates Master Plan models: Product, StoreSetting, Recipe/RecipeBOM,
 * Bundle/BundleItem, POSMapping, plus sample InventoryTransaction receives.
 * Aligns names/costs with lib/mockData.ts where practical.
 *
 * Run: npx prisma db seed  (requires DATABASE_URL + DIRECT_URL)
 */

import { PrismaClient, Department, TransactionType, InventoryLocation } from '@prisma/client';

const prisma = new PrismaClient();

type SeedProduct = {
  key: string;
  barcode?: string;
  name: string;
  department: Department;
  targetMargin: number;
  unit: string;
  unitCost: number;
  receiveQty: number;
};

const PRODUCTS: SeedProduct[] = [
  { key: 'apricots', barcode: 'APR-LAK-01', name: 'Ontario Apricots', department: 'PRODUCE', targetMargin: 0.4, unit: 'quarts', unitCost: 5.8, receiveQty: 20 },
  { key: 'honeycrisp', barcode: '19906', name: 'Honey Crisp Apples', department: 'PRODUCE', targetMargin: 0.4, unit: 'units', unitCost: 1.46, receiveQty: 72 },
  { key: 'bananas', barcode: '2.958', name: 'Green Bananas (Organic)', department: 'PRODUCE', targetMargin: 0.4, unit: 'lbs', unitCost: 1.325, receiveQty: 40 },
  { key: 'avocados', name: 'Avocados Hass', department: 'PRODUCE', targetMargin: 0.4, unit: 'units', unitCost: 1.81, receiveQty: 144 },
  { key: 'blackberries', name: 'Blackberries (170g)', department: 'PRODUCE', targetMargin: 0.4, unit: 'tubs', unitCost: 4.92, receiveQty: 12 },
  { key: 'blueberries', barcode: '828904002100', name: 'Blueberries (170mL)', department: 'PRODUCE', targetMargin: 0.4, unit: 'tubs', unitCost: 3.83, receiveQty: 24 },
  { key: 'strawberries', name: 'Strawberries (454g)', department: 'PRODUCE', targetMargin: 0.4, unit: 'units', unitCost: 6.25, receiveQty: 24 },
  { key: 'hothouse_tomatoes', name: 'Hot House Tomatoes', department: 'PRODUCE', targetMargin: 0.4, unit: 'lbs', unitCost: 2.5, receiveQty: 16 },
  { key: 'cocktail_tomatoes', name: 'Cocktail Tomatoes', department: 'PRODUCE', targetMargin: 0.4, unit: 'units', unitCost: 3.5, receiveQty: 8 },
  { key: 'cilantro', name: 'Cilantro', department: 'PRODUCE', targetMargin: 0.4, unit: 'bunches', unitCost: 1.375, receiveQty: 24 },
  { key: 'jalapeno', name: 'Jalapeno Peppers', department: 'PRODUCE', targetMargin: 0.4, unit: 'lbs', unitCost: 1.9, receiveQty: 10 },
  { key: 'cream', name: 'Whole Heavy Cream 40%', department: 'DAIRY', targetMargin: 0.4, unit: 'L', unitCost: 3.8, receiveQty: 12 },
  { key: 'yogurt', name: 'Greek Whole Milk Yogurt', department: 'DAIRY', targetMargin: 0.4, unit: 'tubs', unitCost: 2.2, receiveQty: 16 },
  { key: 'sourdough', name: 'Artisanal Sourdough Boules', department: 'BAKERY', targetMargin: 0.4, unit: 'loaves', unitCost: 2.1, receiveQty: 18 },
  { key: 'evoo', name: 'Extra Virgin Olive Oil 5L', department: 'PANTRY', targetMargin: 0.4, unit: 'cans', unitCost: 28.5, receiveQty: 8 },
  // Finished goods (recipe outputs)
  { key: 'panzanella', barcode: 'FL-PANZ-20', name: 'Roasted Tomato & Sourdough Panzanella (12 oz)', department: 'PRODUCE', targetMargin: 0.79, unit: 'portions', unitCost: 1.845, receiveQty: 0 },
  { key: 'parfait', barcode: 'FL-PARF-28', name: 'Honeycrisp & Spiced Cream Bakery Parfait (10 oz)', department: 'DAIRY', targetMargin: 0.62, unit: 'portions', unitCost: 2.48, receiveQty: 0 },
  { key: 'guacamole', barcode: 'FL-GUAC-30', name: 'Avocado & Ontario Tomato Guacamole Cups (6 oz)', department: 'PRODUCE', targetMargin: 0.63, unit: 'portions', unitCost: 1.845, receiveQty: 0 },
];

async function main() {
  console.log('Seeding FreshLoop Phase 1 Master Plan data…');

  // Idempotent-ish: clear Master Plan tables only (leave legacy empty / untouched)
  await prisma.bundleItem.deleteMany();
  await prisma.bundle.deleteMany();
  await prisma.recipeBOM.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.pOSMapping.deleteMany();
  await prisma.inventoryTransaction.deleteMany();
  await prisma.storeSetting.deleteMany();
  // Detach legacy links before product wipe
  await prisma.inventoryItem.updateMany({ data: { productId: null } });
  await prisma.recipeFusion.updateMany({ data: { recipeId: null } });
  await prisma.product.deleteMany();

  const productIds: Record<string, string> = {};

  for (const p of PRODUCTS) {
    const created = await prisma.product.create({
      data: {
        barcode: p.barcode ?? null,
        name: p.name,
        department: p.department,
        targetMargin: p.targetMargin,
        unit: p.unit,
      },
    });
    productIds[p.key] = created.id;

    if (p.receiveQty > 0) {
      await prisma.inventoryTransaction.create({
        data: {
          productId: created.id,
          qtyChange: p.receiveQty,
          transactionType: TransactionType.Receive,
          fromLocation: InventoryLocation.Supplier,
          toLocation: InventoryLocation.Retail_Floor,
          unitCostAtTime: p.unitCost,
          referenceId: 'SEED-RECEIVE-001',
          notes: 'Initial seed receive onto Retail_Floor',
        },
      });
    }

    if (p.barcode) {
      await prisma.pOSMapping.create({
        data: {
          productId: created.id,
          externalSku: p.barcode,
          posSystem: 'DEMO_POS',
        },
      });
    }
  }

  await prisma.storeSetting.create({
    data: {
      targetWastePct: 0.02,
      scrapBucketVolumeL: 20,
      estimatedWeightPerLiterKg: 0.45,
      storeName: 'FreshLoop Demo Store',
    },
  });

  // Recipe 1 — Panzanella (mockData rec-001)
  const panzanella = await prisma.recipe.create({
    data: {
      name: 'Roasted Hot House Tomato & Sourdough Panzanella',
      category: 'Salad / Panzanella',
      outputProductId: productIds.panzanella,
      yieldPortions: 20,
      portionSize: '12 oz deli tub',
      targetRetailPrice: 8.99,
      instructions:
        'Cube sourdough; roast with EVOO. Toss with hot house tomatoes, basil, vinaigrette. Pack 12 oz deli tubs.',
      status: 'PROPOSED',
      bomLines: {
        create: [
          { ingredientProductId: productIds.hothouse_tomatoes, quantityRequired: 15, unit: 'lbs' },
          { ingredientProductId: productIds.sourdough, quantityRequired: 8, unit: 'loaves' },
          { ingredientProductId: productIds.evoo, quantityRequired: 0.1, unit: 'cans' }, // ~500 ml of 5L
        ],
      },
    },
  });

  // Recipe 2 — Parfait (mockData rec-002)
  const parfait = await prisma.recipe.create({
    data: {
      name: 'Honeycrisp & Spiced Cream Bakery Parfait',
      category: 'Parfait / Dessert',
      outputProductId: productIds.parfait,
      yieldPortions: 28,
      portionSize: '10 oz parfait cup',
      targetRetailPrice: 6.49,
      instructions:
        'Dice Honeycrisp with spice; fold whipped cream into yogurt; layer with oat crumble.',
      status: 'PROPOSED',
      bomLines: {
        create: [
          { ingredientProductId: productIds.honeycrisp, quantityRequired: 20, unit: 'lbs' },
          { ingredientProductId: productIds.cream, quantityRequired: 6, unit: 'L' },
          { ingredientProductId: productIds.yogurt, quantityRequired: 8, unit: 'tubs' },
        ],
      },
    },
  });

  // Recipe 3 — Guacamole (mockData rec-003)
  const guacamole = await prisma.recipe.create({
    data: {
      name: 'Avocado & Ontario Tomato Guacamole Cups',
      category: 'Prepared Hot Meal',
      outputProductId: productIds.guacamole,
      yieldPortions: 30,
      portionSize: '6 oz Grab-n-Go cup',
      targetRetailPrice: 4.99,
      instructions:
        'Mash Hass avocado with lime; fold cocktail tomatoes, jalapeno, cilantro; portion 6 oz cups.',
      status: 'PROPOSED',
      bomLines: {
        create: [
          { ingredientProductId: productIds.avocados, quantityRequired: 18, unit: 'units' },
          { ingredientProductId: productIds.cocktail_tomatoes, quantityRequired: 2, unit: 'lbs' },
          { ingredientProductId: productIds.cilantro, quantityRequired: 6, unit: 'bunches' },
          { ingredientProductId: productIds.jalapeno, quantityRequired: 4, unit: 'lbs' },
        ],
      },
    },
  });

  // Bundle — berry rescue kit (POS virtual kitting demo)
  await prisma.bundle.create({
    data: {
      name: 'Berry Rescue Trio',
      description: 'Virtual kit: blackberries + blueberries + strawberries for POS explode.',
      posSku: 'BUNDLE-BERRY-TRIO',
      isActive: true,
      items: {
        create: [
          { productId: productIds.blackberries, quantityPerBundle: 1 },
          { productId: productIds.blueberries, quantityPerBundle: 1 },
          { productId: productIds.strawberries, quantityPerBundle: 1 },
        ],
      },
    },
  });

  console.log('Seed complete:', {
    products: PRODUCTS.length,
    recipes: [panzanella.name, parfait.name, guacamole.name],
    storeSettings: 1,
    bundles: 1,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
