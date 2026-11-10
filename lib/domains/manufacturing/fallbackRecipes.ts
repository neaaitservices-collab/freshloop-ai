import type { UnitType } from '@prisma/client';

export interface FallbackRecipeCatalogEntry {
  id: string;
  aliases: string[];
  name: string;
  outputProductId: string;
  outputProductName: string;
  outputUnit: UnitType;
  outputShelfLifeDays: number;
  batchYieldQty: number;
  targetRetailPrice: number;
  isActive: boolean;
  laborHours?: number;
  laborRatePerHour?: number;
  packagingCostPerUnit?: number;
  bomItems: Array<{
    ingredientProductId: string;
    ingredientName: string;
    requiredQty: number;
    unit: UnitType;
    allowVariance: boolean;
    defaultMacCost: number;
  }>;
}

export const MANUFACTURING_RECIPE_ALIASES: Record<string, string> = {
  'rec-tomato-panzanella': 'rec-panzanella-001',
  'rec-001': 'rec-panzanella-001',
  'rec-apple-parfait': 'rec-parfait-002',
  'rec-002': 'rec-parfait-002',
  'rec-avocado-guacamole': 'rec-guacamole-003',
  'rec-003': 'rec-guacamole-003',
};

export function resolveManufacturingRecipeId(recipeId: string): string {
  return MANUFACTURING_RECIPE_ALIASES[recipeId] ?? recipeId;
}

export const FALLBACK_RECIPES: FallbackRecipeCatalogEntry[] = [
  {
    id: 'rec-panzanella-001',
    aliases: ['rec-tomato-panzanella', 'rec-001'],
    name: 'Roasted Hot House Tomato & Sourdough Panzanella',
    outputProductId: 'prod-deli-panzanella',
    outputProductName: 'Roasted Tomato & Sourdough Panzanella (12 oz)',
    outputUnit: 'TUB' as UnitType,
    outputShelfLifeDays: 3,
    batchYieldQty: 20,
    targetRetailPrice: 8.99,
    isActive: true,
    bomItems: [
      {
        ingredientProductId: 'prod-tomato-hothouse',
        ingredientName: 'Hot House Tomatoes (Ontario)',
        requiredQty: 15,
        unit: 'LBS' as UnitType,
        allowVariance: true,
        defaultMacCost: 2.5,
      },
      {
        ingredientProductId: 'prod-sourdough-boule',
        ingredientName: 'Artisanal Sourdough Boule',
        requiredQty: 8,
        unit: 'LOAF' as UnitType,
        allowVariance: true,
        defaultMacCost: 2.1,
      },
      {
        ingredientProductId: 'prod-evoo-5l',
        ingredientName: 'Extra Virgin Olive Oil (Bulk Production)',
        requiredQty: 0.5,
        unit: 'LITER' as UnitType,
        allowVariance: false,
        defaultMacCost: 5.7,
      },
    ],
  },
  {
    id: 'rec-parfait-002',
    aliases: ['rec-apple-parfait', 'rec-002'],
    name: 'Honeycrisp & Spiced Cream Bakery Parfait',
    outputProductId: 'prod-deli-parfait',
    outputProductName: 'Honeycrisp & Spiced Cream Parfait (10 oz)',
    outputUnit: 'TUB' as UnitType,
    outputShelfLifeDays: 3,
    batchYieldQty: 28,
    targetRetailPrice: 6.49,
    isActive: true,
    bomItems: [
      {
        ingredientProductId: 'prod-apple-honeycrisp',
        ingredientName: 'Honey Crisp Apples',
        requiredQty: 20,
        unit: 'LBS' as UnitType,
        allowVariance: true,
        defaultMacCost: 2.62,
      },
      {
        ingredientProductId: 'prod-heavy-cream',
        ingredientName: 'Whole Heavy Cream 40%',
        requiredQty: 6,
        unit: 'LITER' as UnitType,
        allowVariance: true,
        defaultMacCost: 3.8,
      },
      {
        ingredientProductId: 'prod-greek-yogurt',
        ingredientName: 'Greek Whole Milk Yogurt (750g)',
        requiredQty: 8,
        unit: 'TUB' as UnitType,
        allowVariance: false,
        defaultMacCost: 2.2,
      },
    ],
  },
  {
    id: 'rec-guacamole-003',
    aliases: ['rec-avocado-guacamole', 'rec-003'],
    name: 'Avocado & Ontario Tomato Guacamole Cups',
    outputProductId: 'prod-deli-guacamole',
    outputProductName: 'Fresh Production Rescue Guacamole Cup (6 oz)',
    outputUnit: 'TUB' as UnitType,
    outputShelfLifeDays: 2,
    batchYieldQty: 30,
    targetRetailPrice: 4.99,
    isActive: true,
    bomItems: [
      {
        ingredientProductId: 'prod-avocado-hass',
        ingredientName: 'Avocados Hass (Mexico)',
        requiredQty: 18,
        unit: 'UNIT' as UnitType,
        allowVariance: true,
        defaultMacCost: 1.81,
      },
      {
        ingredientProductId: 'prod-tomato-cocktail',
        ingredientName: 'Cocktail Tomatoes',
        requiredQty: 2,
        unit: 'LBS' as UnitType,
        allowVariance: true,
        defaultMacCost: 3.5,
      },
      {
        ingredientProductId: 'prod-cilantro',
        ingredientName: 'Fresh Cilantro Bunch',
        requiredQty: 6,
        unit: 'BUNCH' as UnitType,
        allowVariance: true,
        defaultMacCost: 1.38,
      },
      {
        ingredientProductId: 'prod-jalapeno',
        ingredientName: 'Jalapeno Peppers',
        requiredQty: 4,
        unit: 'LBS' as UnitType,
        allowVariance: true,
        defaultMacCost: 1.9,
      },
    ],
  },
];
