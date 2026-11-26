import { Prisma, RecipeStatus } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import type { RecipeFusionResult } from '@/types';

const FUSION_CATEGORIES = new Set<RecipeFusionResult['category']>([
  'Soup',
  'Salad / Panzanella',
  'Parfait / Dessert',
  'Prepared Hot Meal',
  'Bakery / Bread',
]);

function normalizeCategory(raw: string): RecipeFusionResult['category'] {
  if (FUSION_CATEGORIES.has(raw as RecipeFusionResult['category'])) {
    return raw as RecipeFusionResult['category'];
  }
  return 'Prepared Hot Meal';
}

function instructionsToText(instructions: RecipeFusionResult['instructions']): string {
  if (Array.isArray(instructions)) {
    return instructions.map((step) => step.trim()).filter(Boolean).join('\n');
  }
  return String(instructions ?? '');
}

function instructionsFromText(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function mapRecipeFusionRow(row: {
  id: string;
  recipeName: string;
  category: string;
  ingredientsUsed: unknown;
  estimatedYield: string;
  estimatedCost: number;
  targetRetailPrice: number;
  grossMarginPct: number;
  instructions: string;
  prepTimeMinutes: number | null;
  chefTips: string | null;
  allergens: string[];
  createdAt: Date;
}): RecipeFusionResult {
  const ingredients = Array.isArray(row.ingredientsUsed)
    ? (row.ingredientsUsed as RecipeFusionResult['ingredientsUsed'])
    : [];

  return {
    id: row.id,
    recipeName: row.recipeName,
    category: normalizeCategory(row.category),
    ingredientsUsed: ingredients,
    estimatedYield: row.estimatedYield,
    estimatedCost: row.estimatedCost,
    targetRetailPrice: row.targetRetailPrice,
    grossMarginPct: row.grossMarginPct,
    instructions: instructionsFromText(row.instructions),
    prepTimeMinutes: row.prepTimeMinutes ?? 25,
    chefTips: row.chefTips ?? undefined,
    allergens: row.allergens.length > 0 ? row.allergens : undefined,
    createdAt: row.createdAt.toISOString().split('T')[0],
  };
}

/**
 * Cards the retired in-process generator saved.
 * The old create path dropped the `rec-mock-` id and Prisma assigned a uuid, so the
 * list matches the name, the batch cost, and the ingredient lines (name is the only
 * id those lines had, plus each line's cost).
 */
export const LEGACY_DEMO_FUSION_FINGERPRINTS: ReadonlyArray<{
  recipeName: string;
  estimatedCost: number;
  ingredientsUsed: Prisma.InputJsonArray;
}> = [
  {
    recipeName: 'Spiced Apple & Sweet Cream Bakery Crisp',
    estimatedCost: 38.1,
    ingredientsUsed: [
      { name: 'Bruised Honeycrisp Apples', quantity: '10 lbs', department: 'PRODUCE', estimatedCost: 14.5 },
      { name: 'Heavy Cream 40%', quantity: '4 Liters', department: 'DAIRY', estimatedCost: 15.2 },
      { name: 'Artisanal Sourdough (Crumbs)', quantity: '4 loaves', department: 'BAKERY', estimatedCost: 8.4 },
    ],
  },
  {
    recipeName: 'Creamy Roasted Roma Tomato & Garlic Crouton Soup',
    estimatedCost: 45.3,
    ingredientsUsed: [
      { name: 'Ripe Roma Tomatoes', quantity: '20 lbs', department: 'PRODUCE', estimatedCost: 23 },
      { name: 'Heavy Cream 40%', quantity: '2 Liters', department: 'DAIRY', estimatedCost: 7.6 },
      { name: 'Sourdough Boule Croutons', quantity: '6 loaves', department: 'BAKERY', estimatedCost: 12.6 },
      { name: 'Olive Oil & Herbs', quantity: '250 ml', department: 'PANTRY', estimatedCost: 2.1 },
    ],
  },
];

export function isLegacyDemoFusionRow(row: {
  recipeName: string;
  estimatedCost: number;
  ingredientsUsed: unknown;
}): boolean {
  return LEGACY_DEMO_FUSION_FINGERPRINTS.some(
    (demo) =>
      row.recipeName === demo.recipeName &&
      row.estimatedCost === demo.estimatedCost &&
      JSON.stringify(row.ingredientsUsed) === JSON.stringify(demo.ingredientsUsed)
  );
}

/** One fingerprint match. The list hides these rows; the cleanup script deletes them. */
export function legacyDemoFusionMatch(): Prisma.RecipeFusionWhereInput[] {
  return LEGACY_DEMO_FUSION_FINGERPRINTS.map((demo) => ({
    recipeName: demo.recipeName,
    estimatedCost: demo.estimatedCost,
    ingredientsUsed: { equals: demo.ingredientsUsed },
  }));
}

/** Applied inside `findMany` so the page size is not shortened by a later filter. */
export function legacyDemoFusionWhere(): Prisma.RecipeFusionWhereInput {
  return { NOT: { OR: legacyDemoFusionMatch() } };
}

/** `npx tsx` does not set NODE_ENV, so the flag is required on every run. */
export function demoFusionCleanupMode(
  allowFlag: string | undefined,
  apply: boolean
): 'refuse' | 'count' | 'delete' {
  if (allowFlag !== '1') return 'refuse';
  return apply ? 'delete' : 'count';
}

/** Host and port only. User, password, and path stay out of the log. */
export function databaseHostLabel(databaseUrl: string | undefined): string {
  const raw = databaseUrl?.trim();
  if (!raw) return '(no DATABASE_URL)';
  try {
    return new URL(raw).host || '(no host)';
  } catch {
    return '(unreadable DATABASE_URL)';
  }
}

function fusionIngredientsJson(
  ingredients: RecipeFusionResult['ingredientsUsed']
): Prisma.InputJsonArray {
  return ingredients.map((line) => ({
    name: line.name,
    quantity: line.quantity,
    department: line.department,
    estimatedCost: line.estimatedCost,
    ...(line.inventoryItemId ? { inventoryItemId: line.inventoryItemId } : {}),
  }));
}

export function fusionRecipeCreateData(
  recipe: RecipeFusionResult
): Prisma.RecipeFusionCreateInput {
  return {
    recipeName: recipe.recipeName,
    category: recipe.category,
    ingredientsUsed: fusionIngredientsJson(recipe.ingredientsUsed),
    estimatedYield: recipe.estimatedYield,
    estimatedCost: recipe.estimatedCost,
    targetRetailPrice: recipe.targetRetailPrice,
    grossMarginPct: recipe.grossMarginPct,
    instructions: instructionsToText(recipe.instructions),
    status: RecipeStatus.PROPOSED,
    prepTimeMinutes: recipe.prepTimeMinutes ?? 25,
    chefTips: recipe.chefTips ?? null,
    allergens: recipe.allergens ?? [],
  };
}

/** Always inserts. Model ids are ignored so a suggestion cannot reset an existing row. */
export async function createFusionRecipes(
  recipes: RecipeFusionResult[]
): Promise<RecipeFusionResult[]> {
  if (recipes.length === 0) return [];
  const rows = await prisma.$transaction(
    recipes.map((recipe) =>
      prisma.recipeFusion.create({ data: fusionRecipeCreateData(recipe) })
    )
  );
  return rows.map(mapRecipeFusionRow);
}

export async function listFusionRecipes(limit = 50): Promise<RecipeFusionResult[]> {
  const rows = await prisma.recipeFusion.findMany({
    where: legacyDemoFusionWhere(),
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(mapRecipeFusionRow);
}
