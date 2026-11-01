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

export async function saveFusionRecipe(recipe: RecipeFusionResult): Promise<RecipeFusionResult> {
  const data = {
    recipeName: recipe.recipeName,
    category: recipe.category,
    ingredientsUsed: recipe.ingredientsUsed as unknown as Prisma.InputJsonValue,
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

  const existing =
    recipe.id && !recipe.id.startsWith('rec-gen-') && !recipe.id.startsWith('rec-mock-')
      ? await prisma.recipeFusion.findUnique({ where: { id: recipe.id } })
      : null;

  const row = existing
    ? await prisma.recipeFusion.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.recipeFusion.create({ data });

  return mapRecipeFusionRow(row);
}

export async function listFusionRecipes(limit = 50): Promise<RecipeFusionResult[]> {
  const rows = await prisma.recipeFusion.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(mapRecipeFusionRow);
}
