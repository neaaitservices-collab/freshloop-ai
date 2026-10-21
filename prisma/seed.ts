import fs from 'node:fs';
import path from 'node:path';
import {
  PrismaClient,
  Department,
  UnitType,
  TransactionType,
  InventoryLocation,
} from '@prisma/client';

// Load .env and .env.local so `prisma db seed` / `npx tsx prisma/seed.ts` works with Next.js env files
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
      let val = trimmed.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

loadEnvFiles();

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting FreshLoop AI Phase 1 Database Seeding...');

  // 1. Clean existing Phase 1 data in safe foreign-key order
  await prisma.pOSMapping.deleteMany();
  await prisma.bundleItem.deleteMany();
  await prisma.bundle.deleteMany();
  await prisma.recipeBOM.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.inventoryTransaction.deleteMany();
  await prisma.product.deleteMany();
  await prisma.storeSetting.deleteMany();

  // 2. Seed Global Store Settings
  const storeSetting = await prisma.storeSetting.create({
    data: {
      id: 'store-config-main',
      storeName: 'FreshLoop Artisanal Market - Cobourg',
      targetWastePct: 2.5,
      scrapBucketVolumeL: 20.0,
      estimatedWeightPerLiterKg: 0.65,
      defaultScrapCostPerKg: 3.5,
      pullSensitivityDays: 3,
      costGuardrailVariancePct: 20.0,
    },
  });
  console.log(`✅ StoreSetting configured: ${storeSetting.storeName} (Target Waste: ${storeSetting.targetWastePct}%)`);

  // 3. Seed Supermarket Raw Products & Manufactured Grab-n-Go Output Products
  const rawProductsData = [
    {
      id: 'prod-avocado-hass',
      barcode: '4225',
      name: 'Avocados Hass (Mexico)',
      department: Department.PRODUCE,
      targetMargin: 0.48,
      unitType: UnitType.UNIT,
      casePackSize: 36,
      yieldPct: 75,
      shelfLifeDays: 6,
      supplier: 'Tony Deodato & Sons',
      origin: 'MEXICO',
      standardCost: 1.81, // $65 / 36 units
      retailPrice: 3.49,
      isManufactured: false,
    },
    {
      id: 'prod-tomato-hothouse',
      barcode: '4799',
      name: 'Hot House Tomatoes (Ontario)',
      department: Department.PRODUCE,
      targetMargin: 0.44,
      unitType: UnitType.LBS,
      casePackSize: 16,
      yieldPct: 95,
      shelfLifeDays: 7,
      supplier: 'Casteels Greenhouse',
      origin: 'ONTARIO',
      standardCost: 2.5, // $40 / 16 lbs
      retailPrice: 4.49,
      isManufactured: false,
    },
    {
      id: 'prod-tomato-cocktail',
      barcode: '011067950807',
      name: 'Cocktail Tomatoes',
      department: Department.PRODUCE,
      targetMargin: 0.42,
      unitType: UnitType.LBS,
      casePackSize: 8,
      yieldPct: 98,
      shelfLifeDays: 5,
      supplier: 'Casteels Greenhouse',
      origin: 'ONTARIO',
      standardCost: 3.5,
      retailPrice: 5.99,
      isManufactured: false,
    },
    {
      id: 'prod-apple-honeycrisp',
      barcode: '19906',
      name: 'Honey Crisp Apples',
      department: Department.PRODUCE,
      targetMargin: 0.4,
      unitType: UnitType.LBS,
      casePackSize: 40,
      yieldPct: 92,
      shelfLifeDays: 10,
      supplier: 'Tony Deodato & Sons',
      origin: 'CANADA',
      standardCost: 2.62,
      retailPrice: 4.49,
      isManufactured: false,
    },
    {
      id: 'prod-cilantro',
      barcode: '4889',
      name: 'Fresh Cilantro Bunch',
      department: Department.PRODUCE,
      targetMargin: 0.54,
      unitType: UnitType.BUNCH,
      casePackSize: 24,
      yieldPct: 75,
      shelfLifeDays: 5,
      supplier: 'Tony Deodato & Sons',
      origin: 'CANADA',
      standardCost: 1.38,
      retailPrice: 2.99,
      isManufactured: false,
    },
    {
      id: 'prod-jalapeno',
      barcode: '4693',
      name: 'Jalapeno Peppers',
      department: Department.PRODUCE,
      targetMargin: 0.53,
      unitType: UnitType.LBS,
      casePackSize: 10,
      yieldPct: 85,
      shelfLifeDays: 11,
      supplier: 'Tony Deodato & Sons',
      origin: 'MEXICO',
      standardCost: 1.9,
      retailPrice: 3.99,
      isManufactured: false,
    },
    {
      id: 'prod-heavy-cream',
      barcode: '068700100402',
      name: 'Whole Heavy Cream 40%',
      department: Department.DAIRY,
      targetMargin: 0.38,
      unitType: UnitType.LITER,
      casePackSize: 4,
      yieldPct: 100,
      shelfLifeDays: 8,
      supplier: 'Golden State Dairy',
      origin: 'ONTARIO',
      standardCost: 3.8,
      retailPrice: 6.49,
      isManufactured: false,
    },
    {
      id: 'prod-greek-yogurt',
      barcode: '068700200911',
      name: 'Greek Whole Milk Yogurt (750g)',
      department: Department.DAIRY,
      targetMargin: 0.4,
      unitType: UnitType.TUB,
      casePackSize: 6,
      yieldPct: 100,
      shelfLifeDays: 10,
      supplier: 'Golden State Dairy',
      origin: 'ONTARIO',
      standardCost: 2.2,
      retailPrice: 4.29,
      isManufactured: false,
    },
    {
      id: 'prod-sourdough-boule',
      barcode: '8001039001',
      name: 'Artisanal Sourdough Boule',
      department: Department.BAKERY,
      targetMargin: 0.44,
      unitType: UnitType.LOAF,
      casePackSize: 9,
      yieldPct: 100,
      shelfLifeDays: 4,
      supplier: 'Moores Artisan Bakery',
      origin: 'COBOURG',
      standardCost: 2.1,
      retailPrice: 4.99,
      isManufactured: false,
    },
    {
      id: 'prod-evoo-5l',
      barcode: '841001005000',
      name: 'Extra Virgin Olive Oil (Bulk Kitchen)',
      department: Department.PANTRY,
      targetMargin: 0.45,
      unitType: UnitType.LITER,
      casePackSize: 20, // 4 x 5L cans
      yieldPct: 100,
      shelfLifeDays: 180,
      supplier: 'Mediterranean Imports',
      origin: 'SPAIN',
      standardCost: 5.7, // $114 / 20L
      retailPrice: 10.99,
      isManufactured: false,
    },
  ];

  // Manufactured Grab-n-Go Deli / Kitchen Products (output of Recipes)
  const manufacturedProductsData = [
    {
      id: 'prod-deli-panzanella',
      barcode: '290001000018',
      name: 'Roasted Tomato & Sourdough Panzanella (12 oz)',
      department: Department.DELI_KITCHEN,
      targetMargin: 0.75,
      unitType: UnitType.TUB,
      casePackSize: 1,
      yieldPct: 100,
      shelfLifeDays: 3,
      supplier: 'FreshLoop Kitchen',
      origin: 'IN-HOUSE',
      standardCost: 1.98,
      retailPrice: 8.99,
      isManufactured: true,
    },
    {
      id: 'prod-deli-parfait',
      barcode: '290001000025',
      name: 'Honeycrisp & Spiced Cream Parfait (10 oz)',
      department: Department.DELI_KITCHEN,
      targetMargin: 0.62,
      unitType: UnitType.TUB,
      casePackSize: 1,
      yieldPct: 100,
      shelfLifeDays: 3,
      supplier: 'FreshLoop Kitchen',
      origin: 'IN-HOUSE',
      standardCost: 2.97,
      retailPrice: 6.49,
      isManufactured: true,
    },
    {
      id: 'prod-deli-guacamole',
      barcode: '290001000032',
      name: 'Fresh Kitchen Rescue Guacamole Cup (6 oz)',
      department: Department.DELI_KITCHEN,
      targetMargin: 0.65,
      unitType: UnitType.TUB,
      casePackSize: 1,
      yieldPct: 100,
      shelfLifeDays: 2,
      supplier: 'FreshLoop Kitchen',
      origin: 'IN-HOUSE',
      standardCost: 1.82,
      retailPrice: 4.99,
      isManufactured: true,
    },
  ];

  for (const prod of [...rawProductsData, ...manufacturedProductsData]) {
    await prisma.product.create({ data: prod });
  }
  console.log(`✅ Created ${rawProductsData.length + manufacturedProductsData.length} Products (Raw + Kitchen Manufactured)`);

  // 4. Seed Kitchen Rescue Recipes & Bill of Materials (RecipeBOM)
  const panzanellaRecipe = await prisma.recipe.create({
    data: {
      id: 'rec-panzanella-001',
      name: 'Roasted Hot House Tomato & Sourdough Panzanella',
      category: 'Salad / Panzanella',
      outputProductId: 'prod-deli-panzanella',
      batchYieldQty: 20, // 20 x 12oz tubs
      targetRetailPrice: 8.99,
      prepTimeMinutes: 25,
      restrictedToRole: 'KITCHEN_STAFF',
      instructions:
        '1. Cube sourdough loaves into 1-inch pieces and toss with olive oil, sea salt, and cracked pepper.\n' +
        '2. Roast sourdough cubes at 375F for 12 minutes until golden and crunchy.\n' +
        '3. Slice hot house tomatoes into thick wedges.\n' +
        '4. Toss warm croutons with sliced tomatoes and house vinaigrette.\n' +
        '5. Pack into 20 x 12 oz clear deli tubs with FreshLoop Grab-n-Go branding.',
      chefTips: 'Highlight Handcrafted Kitchen Rescue on label to boost customer purchase intent.',
      allergens: ['Wheat / Gluten'],
      bomItems: {
        create: [
          {
            ingredientProductId: 'prod-tomato-hothouse',
            requiredQty: 15,
            unit: UnitType.LBS,
            allowVariance: true,
            notes: 'Slightly soft / overripe tomatoes work best for roasting.',
          },
          {
            ingredientProductId: 'prod-sourdough-boule',
            requiredQty: 8,
            unit: UnitType.LOAF,
            allowVariance: true,
            notes: 'Day-old loaves ideal for croutons.',
          },
          {
            ingredientProductId: 'prod-evoo-5l',
            requiredQty: 0.5,
            unit: UnitType.LITER,
            allowVariance: false,
            notes: '500mL culinary oil allocation.',
          },
        ],
      },
    },
  });

  const parfaitRecipe = await prisma.recipe.create({
    data: {
      id: 'rec-parfait-002',
      name: 'Honeycrisp & Spiced Cream Bakery Parfait',
      category: 'Parfait / Dessert',
      outputProductId: 'prod-deli-parfait',
      batchYieldQty: 28, // 28 x 10oz cups
      targetRetailPrice: 6.49,
      prepTimeMinutes: 30,
      restrictedToRole: 'KITCHEN_STAFF',
      instructions:
        '1. Dice Honeycrisp apples into 1/2-inch cubes and simmer with cinnamon and brown sugar.\n' +
        '2. Whip heavy cream and fold gently into Greek yogurt to create a velvety mousse base.\n' +
        '3. Layer spiced apples and yogurt mousse in 28 x 10 oz parfait cups.\n' +
        '4. Chill at 38F before displaying in Grab-n-Go case.',
      chefTips: 'Pairs cross-department Produce + Dairy short-dated items into a high-margin dessert.',
      allergens: ['Milk / Dairy'],
      bomItems: {
        create: [
          {
            ingredientProductId: 'prod-apple-honeycrisp',
            requiredQty: 20,
            unit: UnitType.LBS,
            allowVariance: true,
            notes: 'Trim any surface bruises before dicing.',
          },
          {
            ingredientProductId: 'prod-heavy-cream',
            requiredQty: 6,
            unit: UnitType.LITER,
            allowVariance: true,
          },
          {
            ingredientProductId: 'prod-greek-yogurt',
            requiredQty: 8,
            unit: UnitType.TUB,
            allowVariance: false,
          },
        ],
      },
    },
  });

  const guacamoleRecipe = await prisma.recipe.create({
    data: {
      id: 'rec-guacamole-003',
      name: 'Avocado & Ontario Tomato Guacamole Cups',
      category: 'Prepared Grab-n-Go',
      outputProductId: 'prod-deli-guacamole',
      batchYieldQty: 30, // 30 x 6oz cups
      targetRetailPrice: 4.99,
      prepTimeMinutes: 20,
      restrictedToRole: 'KITCHEN_STAFF',
      instructions:
        '1. Halve and pit overripe Hass avocados (75% usable yield).\n' +
        '2. Dice cocktail tomatoes, mince jalapeno, and chop fresh cilantro.\n' +
        '3. Mash avocado with lime juice, kosher salt, and fold in aromatics.\n' +
        '4. Portion into 30 x 6 oz clear cups and seal immediately.',
      chefTips: 'Avocados at 75% yield still produce a premium product. Price at $4.99 to move volume fast.',
      allergens: [],
      bomItems: {
        create: [
          {
            ingredientProductId: 'prod-avocado-hass',
            requiredQty: 18,
            unit: UnitType.UNIT,
            allowVariance: true,
          },
          {
            ingredientProductId: 'prod-tomato-cocktail',
            requiredQty: 2,
            unit: UnitType.LBS,
            allowVariance: true,
          },
          {
            ingredientProductId: 'prod-cilantro',
            requiredQty: 6,
            unit: UnitType.BUNCH,
            allowVariance: true,
          },
          {
            ingredientProductId: 'prod-jalapeno',
            requiredQty: 4,
            unit: UnitType.LBS,
            allowVariance: true,
          },
        ],
      },
    },
  });
  console.log(`✅ Created 3 Kitchen Recipes with BOMs: ${panzanellaRecipe.name}, ${parfaitRecipe.name}, ${guacamoleRecipe.name}`);

  // 5. Seed Virtual Kitting Bundles & POS Mappings
  const tacoFiestaBundle = await prisma.bundle.create({
    data: {
      id: 'bundle-fiesta-guac',
      name: 'Fresh Fiesta Guacamole DIY Kit',
      bundleSku: 'POS-KIT-GUAC-01',
      description: 'Virtual POS bundle: 4 Hass Avocados + 1 lb Cocktail Tomatoes + 1 Cilantro Bunch + 0.5 lb Jalapenos',
      bundlePrice: 14.99,
      discountPct: 22.0,
      isActive: true,
      items: {
        create: [
          { productId: 'prod-avocado-hass', quantity: 4 },
          { productId: 'prod-tomato-cocktail', quantity: 1 },
          { productId: 'prod-cilantro', quantity: 1 },
          { productId: 'prod-jalapeno', quantity: 0.5 },
        ],
      },
    },
  });

  const bruschettaBundle = await prisma.bundle.create({
    data: {
      id: 'bundle-bruschetta-duo',
      name: 'Artisan Bruschetta & Sourdough Duo',
      bundleSku: 'POS-KIT-BRUS-02',
      description: 'Virtual POS bundle: 1 Sourdough Boule + 2 lbs Hot House Tomatoes',
      bundlePrice: 9.99,
      discountPct: 28.5,
      isActive: true,
      items: {
        create: [
          { productId: 'prod-sourdough-boule', quantity: 1 },
          { productId: 'prod-tomato-hothouse', quantity: 2 },
        ],
      },
    },
  });

  await prisma.pOSMapping.createMany({
    data: [
      { externalSku: 'PLU-4225', posSystem: 'SQUARE_POS', productId: 'prod-avocado-hass' },
      { externalSku: 'PLU-4799', posSystem: 'SQUARE_POS', productId: 'prod-tomato-hothouse' },
      { externalSku: 'PLU-19906', posSystem: 'SQUARE_POS', productId: 'prod-apple-honeycrisp' },
      { externalSku: 'SKU-BAK-SOUR', posSystem: 'SQUARE_POS', productId: 'prod-sourdough-boule' },
      { externalSku: 'DELI-PANZ-12OZ', posSystem: 'SQUARE_POS', productId: 'prod-deli-panzanella' },
      { externalSku: 'DELI-GUAC-6OZ', posSystem: 'SQUARE_POS', productId: 'prod-deli-guacamole' },
      { externalSku: tacoFiestaBundle.bundleSku, posSystem: 'SQUARE_POS', bundleId: tacoFiestaBundle.id },
      { externalSku: bruschettaBundle.bundleSku, posSystem: 'SQUARE_POS', bundleId: bruschettaBundle.id },
    ],
  });
  console.log('✅ Created Virtual Kitting Bundles & POS SKU Mappings');

  // 6. Seed Immutable Inventory Ledger (InventoryTransaction)
  // Helper dates relative to now so expiration sliders (2, 3, 4 days) work out-of-the-box
  const now = new Date();
  const daysFromNow = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

  const ledgerEntries = [
    // Initial Vendor Receipts onto Retail_Floor & Kitchen_Prep
    {
      productId: 'prod-avocado-hass',
      staffId: 'staff-receiver-01',
      qtyChange: 144, // 4 cases * 36 units
      transactionType: TransactionType.Receive,
      fromLocation: InventoryLocation.External_Vendor,
      toLocation: InventoryLocation.Retail_Floor,
      unitCostAtTime: 1.81,
      referenceId: 'INV-TD-2026-101',
      expirationDate: daysFromNow(2), // Triggers 2-day pull slider
      notes: 'Received 4 cases Hass Avocados from Tony Deodato',
    },
    {
      productId: 'prod-tomato-hothouse',
      staffId: 'staff-receiver-01',
      qtyChange: 64, // 4 cases * 16 lbs
      transactionType: TransactionType.Receive,
      fromLocation: InventoryLocation.External_Vendor,
      toLocation: InventoryLocation.Retail_Floor,
      unitCostAtTime: 2.5,
      referenceId: 'INV-CAS-2026-102',
      expirationDate: daysFromNow(3), // Triggers 3-day pull slider
      notes: 'Received 4 cases Ontario Hot House Tomatoes',
    },
    {
      productId: 'prod-tomato-cocktail',
      staffId: 'staff-receiver-01',
      qtyChange: 24,
      transactionType: TransactionType.Receive,
      fromLocation: InventoryLocation.External_Vendor,
      toLocation: InventoryLocation.Retail_Floor,
      unitCostAtTime: 3.5,
      referenceId: 'INV-CAS-2026-102',
      expirationDate: daysFromNow(3),
      notes: 'Received 3 cases Cocktail Tomatoes',
    },
    {
      productId: 'prod-apple-honeycrisp',
      staffId: 'staff-receiver-01',
      qtyChange: 80, // 2 cases * 40 lbs
      transactionType: TransactionType.Receive,
      fromLocation: InventoryLocation.External_Vendor,
      toLocation: InventoryLocation.Retail_Floor,
      unitCostAtTime: 2.62,
      referenceId: 'INV-TD-2026-101',
      expirationDate: daysFromNow(4), // Triggers 4-day pull slider
      notes: 'Received 2 cases Honeycrisp Apples',
    },
    {
      productId: 'prod-sourdough-boule',
      staffId: 'staff-bakery-02',
      qtyChange: 27, // 3 cases * 9 loaves
      transactionType: TransactionType.Receive,
      fromLocation: InventoryLocation.External_Vendor,
      toLocation: InventoryLocation.Retail_Floor,
      unitCostAtTime: 2.1,
      referenceId: 'INV-MOO-2026-088',
      expirationDate: daysFromNow(2),
      notes: 'Morning delivery Moores Artisanal Sourdough',
    },
    {
      productId: 'prod-heavy-cream',
      staffId: 'staff-receiver-01',
      qtyChange: 16, // 4 cases * 4L
      transactionType: TransactionType.Receive,
      fromLocation: InventoryLocation.External_Vendor,
      toLocation: InventoryLocation.Retail_Floor,
      unitCostAtTime: 3.8,
      referenceId: 'INV-GSD-2026-044',
      expirationDate: daysFromNow(3),
      notes: 'Dairy cooler delivery',
    },
    {
      productId: 'prod-greek-yogurt',
      staffId: 'staff-receiver-01',
      qtyChange: 24,
      transactionType: TransactionType.Receive,
      fromLocation: InventoryLocation.External_Vendor,
      toLocation: InventoryLocation.Kitchen_Prep,
      unitCostAtTime: 2.2,
      referenceId: 'INV-GSD-2026-044',
      expirationDate: daysFromNow(6),
      notes: 'Received directly to Kitchen Prep walk-in',
    },
    {
      productId: 'prod-cilantro',
      staffId: 'staff-receiver-01',
      qtyChange: 24,
      transactionType: TransactionType.Receive,
      fromLocation: InventoryLocation.External_Vendor,
      toLocation: InventoryLocation.Retail_Floor,
      unitCostAtTime: 1.38,
      referenceId: 'INV-TD-2026-101',
      expirationDate: daysFromNow(3),
    },
    {
      productId: 'prod-jalapeno',
      staffId: 'staff-receiver-01',
      qtyChange: 20,
      transactionType: TransactionType.Receive,
      fromLocation: InventoryLocation.External_Vendor,
      toLocation: InventoryLocation.Retail_Floor,
      unitCostAtTime: 1.9,
      referenceId: 'INV-TD-2026-101',
      expirationDate: daysFromNow(8),
    },
    {
      productId: 'prod-evoo-5l',
      staffId: 'staff-kitchen-01',
      qtyChange: 20,
      transactionType: TransactionType.Receive,
      fromLocation: InventoryLocation.External_Vendor,
      toLocation: InventoryLocation.Kitchen_Prep,
      unitCostAtTime: 5.7,
      referenceId: 'INV-MED-2026-019',
      expirationDate: daysFromNow(120),
      notes: 'Bulk EVOO for kitchen manufacturing',
    },

    // Rescue Transfer (Retail_Floor -> Kitchen_Prep): Double-entry (-Retail_Floor, +Kitchen_Prep)
    {
      productId: 'prod-avocado-hass',
      staffId: 'staff-produce-03',
      qtyChange: -36,
      transactionType: TransactionType.Rescue,
      fromLocation: InventoryLocation.Retail_Floor,
      toLocation: InventoryLocation.Kitchen_Prep,
      unitCostAtTime: 1.81,
      referenceId: 'RESCUE-LOG-001',
      expirationDate: daysFromNow(2),
      notes: 'Pulled 1 case overripe Hass Avocados from Retail Floor to Kitchen Prep',
    },
    {
      productId: 'prod-avocado-hass',
      staffId: 'staff-produce-03',
      qtyChange: 36,
      transactionType: TransactionType.Rescue,
      fromLocation: InventoryLocation.Retail_Floor,
      toLocation: InventoryLocation.Kitchen_Prep,
      unitCostAtTime: 1.81,
      referenceId: 'RESCUE-LOG-001',
      expirationDate: daysFromNow(2),
      notes: 'Received 1 case overripe Hass Avocados in Kitchen Prep for Guacamole',
    },
    {
      productId: 'prod-tomato-hothouse',
      staffId: 'staff-produce-03',
      qtyChange: -15,
      transactionType: TransactionType.Rescue,
      fromLocation: InventoryLocation.Retail_Floor,
      toLocation: InventoryLocation.Kitchen_Prep,
      unitCostAtTime: 2.5,
      referenceId: 'RESCUE-LOG-002',
      expirationDate: daysFromNow(3),
      notes: 'Transferred 15 lbs Hot House Tomatoes to Kitchen Prep for Panzanella',
    },
    {
      productId: 'prod-tomato-hothouse',
      staffId: 'staff-produce-03',
      qtyChange: 15,
      transactionType: TransactionType.Rescue,
      fromLocation: InventoryLocation.Retail_Floor,
      toLocation: InventoryLocation.Kitchen_Prep,
      unitCostAtTime: 2.5,
      referenceId: 'RESCUE-LOG-002',
      expirationDate: daysFromNow(3),
      notes: 'Received 15 lbs Hot House Tomatoes in Kitchen Prep',
    },
    {
      productId: 'prod-sourdough-boule',
      staffId: 'staff-bakery-02',
      qtyChange: -8,
      transactionType: TransactionType.Rescue,
      fromLocation: InventoryLocation.Retail_Floor,
      toLocation: InventoryLocation.Kitchen_Prep,
      unitCostAtTime: 2.1,
      referenceId: 'RESCUE-LOG-003',
      expirationDate: daysFromNow(2),
      notes: 'Pulled 8 day-old Sourdough Boules to Kitchen Prep',
    },
    {
      productId: 'prod-sourdough-boule',
      staffId: 'staff-bakery-02',
      qtyChange: 8,
      transactionType: TransactionType.Rescue,
      fromLocation: InventoryLocation.Retail_Floor,
      toLocation: InventoryLocation.Kitchen_Prep,
      unitCostAtTime: 2.1,
      referenceId: 'RESCUE-LOG-003',
      expirationDate: daysFromNow(2),
      notes: 'Received 8 Sourdough Boules in Kitchen Prep',
    },

    // Regular POS Sales from Retail_Floor
    {
      productId: 'prod-avocado-hass',
      staffId: 'pos-terminal-01',
      qtyChange: -20,
      transactionType: TransactionType.POS_Sale,
      fromLocation: InventoryLocation.Retail_Floor,
      toLocation: InventoryLocation.Customer_Out,
      unitCostAtTime: 1.81,
      referenceId: 'POS-BATCH-MORNING',
      notes: 'Retail POS sales - 20 units @ $3.49',
    },
    {
      productId: 'prod-apple-honeycrisp',
      staffId: 'pos-terminal-01',
      qtyChange: -18,
      transactionType: TransactionType.POS_Sale,
      fromLocation: InventoryLocation.Retail_Floor,
      toLocation: InventoryLocation.Customer_Out,
      unitCostAtTime: 2.62,
      referenceId: 'POS-BATCH-MORNING',
      notes: 'Retail POS sales - 18 lbs @ $4.49',
    },

    // Recorded Waste Event (Retail_Floor -> Waste_Bin)
    {
      productId: 'prod-tomato-hothouse',
      staffId: 'staff-produce-03',
      qtyChange: -3,
      transactionType: TransactionType.Waste,
      fromLocation: InventoryLocation.Retail_Floor,
      toLocation: InventoryLocation.Waste_Bin,
      unitCostAtTime: 2.5,
      referenceId: 'WASTE-LOG-001',
      notes: 'Crushed in bottom of crate during morning restock',
    },
  ];

  for (const entry of ledgerEntries) {
    await prisma.inventoryTransaction.create({ data: entry });
  }
  console.log(`✅ Created ${ledgerEntries.length} Immutable InventoryTransactions`);
  console.log('🎉 Phase 1 Database Seeding Complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
