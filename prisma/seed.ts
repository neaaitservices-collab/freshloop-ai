import fs from 'node:fs';
import path from 'node:path';
import { Department, InventoryLocation, PrismaClient, TransactionType } from '@prisma/client';

function loadEnvFiles() {
  for (const fileName of ['.env.local', '.env']) {
    const filePath = path.resolve(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

loadEnvFiles();

const prisma = new PrismaClient();

type SeedProduct = {
  key: string;
  barcode?: string;
  name: string;
  department: Department;
  targetMargin: number;
  unitType: 'KG' | 'LBS' | 'LITER' | 'ML' | 'UNIT' | 'BUNCH' | 'LOAF' | 'TUB' | 'CASE';
  unitCost: number;
  receiveQty: number;
};

const PRODUCTS: SeedProduct[] = [
  { key: 'apricots', barcode: 'APR-LAK-01', name: 'Ontario Apricots', department: 'PRODUCE', targetMargin: 0.4, unitType: 'UNIT', unitCost: 5.8, receiveQty: 20 },
  { key: 'honeycrisp', barcode: '19906', name: 'Honey Crisp Apples', department: 'PRODUCE', targetMargin: 0.4, unitType: 'UNIT', unitCost: 1.46, receiveQty: 72 },
  { key: 'bananas', barcode: '2.958', name: 'Green Bananas (Organic)', department: 'PRODUCE', targetMargin: 0.4, unitType: 'LBS', unitCost: 1.325, receiveQty: 40 },
  { key: 'avocados', name: 'Avocados Hass', department: 'PRODUCE', targetMargin: 0.4, unitType: 'UNIT', unitCost: 1.81, receiveQty: 144 },
  { key: 'blackberries', name: 'Blackberries (170g)', department: 'PRODUCE', targetMargin: 0.4, unitType: 'TUB', unitCost: 4.92, receiveQty: 12 },
  { key: 'blueberries', barcode: '828904002100', name: 'Blueberries (170mL)', department: 'PRODUCE', targetMargin: 0.4, unitType: 'TUB', unitCost: 3.83, receiveQty: 24 },
  { key: 'strawberries', name: 'Strawberries (454g)', department: 'PRODUCE', targetMargin: 0.4, unitType: 'UNIT', unitCost: 6.25, receiveQty: 24 },
  { key: 'hothouse_tomatoes', name: 'Hot House Tomatoes', department: 'PRODUCE', targetMargin: 0.4, unitType: 'LBS', unitCost: 2.5, receiveQty: 16 },
  { key: 'cocktail_tomatoes', name: 'Cocktail Tomatoes', department: 'PRODUCE', targetMargin: 0.4, unitType: 'UNIT', unitCost: 3.5, receiveQty: 8 },
  { key: 'cilantro', name: 'Cilantro', department: 'PRODUCE', targetMargin: 0.4, unitType: 'BUNCH', unitCost: 1.375, receiveQty: 24 },
  { key: 'jalapeno', name: 'Jalapeno Peppers', department: 'PRODUCE', targetMargin: 0.4, unitType: 'LBS', unitCost: 1.9, receiveQty: 10 },
  { key: 'cream', name: 'Whole Heavy Cream 40%', department: 'DAIRY', targetMargin: 0.4, unitType: 'LITER', unitCost: 3.8, receiveQty: 12 },
  { key: 'yogurt', name: 'Greek Whole Milk Yogurt', department: 'DAIRY', targetMargin: 0.4, unitType: 'TUB', unitCost: 2.2, receiveQty: 16 },
  { key: 'sourdough', name: 'Artisanal Sourdough Boules', department: 'BAKERY', targetMargin: 0.4, unitType: 'LOAF', unitCost: 2.1, receiveQty: 18 },
  { key: 'evoo', name: 'Extra Virgin Olive Oil 5L', department: 'PANTRY', targetMargin: 0.4, unitType: 'CASE', unitCost: 28.5, receiveQty: 8 },
  { key: 'panzanella', barcode: 'FL-PANZ-20', name: 'Roasted Tomato & Sourdough Panzanella (12 oz)', department: 'PRODUCE', targetMargin: 0.79, unitType: 'UNIT', unitCost: 1.845, receiveQty: 0 },
  { key: 'parfait', barcode: 'FL-PARF-28', name: 'Honeycrisp & Spiced Cream Bakery Parfait (10 oz)', department: 'DAIRY', targetMargin: 0.62, unitType: 'UNIT', unitCost: 2.48, receiveQty: 0 },
  { key: 'guacamole', barcode: 'FL-GUAC-30', name: 'Avocado & Ontario Tomato Guacamole Cups (6 oz)', department: 'PRODUCE', targetMargin: 0.63, unitType: 'UNIT', unitCost: 1.845, receiveQty: 0 },
];

async function main() {
  console.log('🌱 Starting FreshLoop AI database seed...');

  await prisma.pOSMapping.deleteMany();
  await prisma.bundleItem.deleteMany();
  await prisma.bundle.deleteMany();
  await prisma.recipeBOM.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.inventoryTransaction.deleteMany();
  await prisma.storeSetting.deleteMany();
  await prisma.product.deleteMany();

  const productIds: Record<string, string> = {};

  for (const product of PRODUCTS) {
    const created = await prisma.product.create({
      data: {
        barcode: product.barcode ?? null,
        name: product.name,
        department: product.department,
        targetMargin: product.targetMargin,
        unitType: product.unitType,
        standardCost: product.unitCost,
      },
    });

    productIds[product.key] = created.id;

    if (product.receiveQty > 0) {
      await prisma.inventoryTransaction.create({
        data: {
          productId: created.id,
          staffId: 'SEED-STAFF',
          qtyChange: product.receiveQty,
          transactionType: TransactionType.Receive,
          fromLocation: InventoryLocation.Supplier,
          toLocation: InventoryLocation.Retail_Floor,
          unitCostAtTime: product.unitCost,
          referenceId: 'SEED-RECEIVE',
          notes: 'Initial seed receive',
        },
      });
    }

    if (product.barcode) {
      await prisma.pOSMapping.create({
        data: {
          productId: created.id,
          externalSku: product.barcode,
          posSystem: 'DEMO_POS',
          isActive: true,
        },
      });
    }
  }

  await prisma.storeSetting.create({
    data: {
      storeName: 'FreshLoop Demo Store',
      targetWastePct: 2.5,
      scrapBucketVolumeL: 20,
      estimatedWeightPerLiterKg: 0.65,
      defaultScrapCostPerKg: 3.5,
      pullSensitivityDays: 3,
      costGuardrailVariancePct: 20,
    },
  });

  const panzanella = await prisma.recipe.create({
    data: {
      name: 'Roasted Hot House Tomato & Sourdough Panzanella',
      category: 'Salad / Panzanella',
      outputProductId: productIds.panzanella,
      yieldPortions: 20,
      portionSize: '12 oz deli tub',
      targetRetailPrice: 8.99,
      instructions: 'Cube sourdough; roast tomatoes; toss with vinaigrette and herbs.',
      status: 'PROPOSED',
      bomLines: {
        create: [
          { ingredientProductId: productIds.hothouse_tomatoes, quantityRequired: 15, unit: 'LBS' },
          { ingredientProductId: productIds.sourdough, quantityRequired: 8, unit: 'LOAF' },
          { ingredientProductId: productIds.evoo, quantityRequired: 0.1, unit: 'CASE' },
        ],
      },
    },
  });

  const parfait = await prisma.recipe.create({
    data: {
      name: 'Honeycrisp & Spiced Cream Bakery Parfait',
      category: 'Parfait / Dessert',
      outputProductId: productIds.parfait,
      yieldPortions: 28,
      portionSize: '10 oz parfait cup',
      targetRetailPrice: 6.49,
      instructions: 'Dice apples; layer with cream and yogurt.',
      status: 'PROPOSED',
      bomLines: {
        create: [
          { ingredientProductId: productIds.honeycrisp, quantityRequired: 20, unit: 'LBS' },
          { ingredientProductId: productIds.cream, quantityRequired: 6, unit: 'LITER' },
          { ingredientProductId: productIds.yogurt, quantityRequired: 8, unit: 'TUB' },
        ],
      },
    },
  });

  await prisma.recipe.create({
    data: {
      name: 'Avocado & Ontario Tomato Guacamole Cups',
      category: 'Prepared Hot Meal',
      outputProductId: productIds.guacamole,
      yieldPortions: 30,
      portionSize: '6 oz Grab-n-Go cup',
      targetRetailPrice: 4.99,
      instructions: 'Mash avocado with tomato, jalapeno, cilantro, and lime.',
      status: 'PROPOSED',
      bomLines: {
        create: [
          { ingredientProductId: productIds.avocados, quantityRequired: 18, unit: 'UNIT' },
          { ingredientProductId: productIds.cocktail_tomatoes, quantityRequired: 2, unit: 'LBS' },
          { ingredientProductId: productIds.cilantro, quantityRequired: 6, unit: 'BUNCH' },
          { ingredientProductId: productIds.jalapeno, quantityRequired: 4, unit: 'LBS' },
        ],
      },
    },
  });

  await prisma.bundle.create({
    data: {
      name: 'Berry Rescue Trio',
      description: 'Virtual kit: blackberries + blueberries + strawberries for POS explode.',
      bundleSku: 'BUNDLE-BERRY-TRIO',
      bundlePrice: 14.99,
      discountPct: 10,
      isActive: true,
      items: {
        create: [
          { productId: productIds.blackberries, quantity: 1 },
          { productId: productIds.blueberries, quantity: 1 },
          { productId: productIds.strawberries, quantity: 1 },
        ],
      },
    },
  });

  console.log('Seed complete', {
    products: PRODUCTS.length,
    recipes: [panzanella.name, parfait.name],
    bundles: 1,
  });
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
