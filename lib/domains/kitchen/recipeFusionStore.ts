import { Prisma, RecipeStatus } from '@prisma/client';
import { prisma } from '@/lib/domains/inventory/ledger';
import { legacyDemoFusionMatch } from '@/lib/domains/kitchen/legacyDemoFusion';
import type { RecipeFusionResult } from '@/types';

export {
  LEGACY_DEMO_FUSION_FINGERPRINTS,
  legacyDemoFusionMatch,
} from '@/lib/domains/kitchen/legacyDemoFusion';

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

/** Applied inside `findMany` so the page size is not shortened by a later filter. */
export function legacyDemoFusionWhere(): Prisma.RecipeFusionWhereInput {
  const matches = legacyDemoFusionMatch();
  return {
    NOT: {
      OR: matches.map((demo) => ({
        recipeName: demo.recipeName,
        estimatedCost: demo.estimatedCost,
        ingredientsUsed: {
          equals: demo.ingredientsUsed.equals.map((line) => ({
            name: line.name,
            quantity: line.quantity,
            department: line.department,
            estimatedCost: line.estimatedCost,
          })),
        },
      })),
    },
  };
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
