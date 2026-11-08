import type { Prisma } from '@prisma/client';

/** Slim recipe + BOM payload for bootstrap, GET /api/recipes, and fusion cards. */
export const RECIPE_API_LIST_SELECT = {
  id: true,
  name: true,
  category: true,
  status: true,
  yieldPortions: true,
  portionSize: true,
  targetRetailPrice: true,
  laborHours: true,
  laborRate: true,
  packagingCostPerUnit: true,
  instructions: true,
  createdAt: true,
  outputProductId: true,
  outputProduct: { select: { id: true, name: true, unitType: true } },
  bomLines: {
    select: {
      id: true,
      quantityRequired: true,
      unit: true,
      ingredientProductId: true,
      ingredientProduct: {
        select: { id: true, name: true, unitType: true, standardCost: true },
      },
    },
  },
} satisfies Prisma.RecipeSelect;

export type RecipeApiListRow = Prisma.RecipeGetPayload<{ select: typeof RECIPE_API_LIST_SELECT }>;
