import { prisma } from '@/lib/domains/inventory/ledger';
import { rememberLedgerRead } from '@/lib/domains/inventory/ledgerCache';
import { RECIPE_API_LIST_SELECT, type RecipeApiListRow } from '@/lib/domains/manufacturing/recipeListSelect';

const RECIPE_LIST_MS = 45_000;
const recipeListCache = new Map<
  string,
  { at: number; gen: number; value: Promise<RecipeListBundle> }
>();

const INVENTORY_PRODUCTS_SELECT = {
  id: true,
  name: true,
  department: true,
  unitType: true,
  standardCost: true,
  retailPrice: true,
} as const;

export type RecipeListBundle = {
  recipes: RecipeApiListRow[];
  inventoryProducts: Array<{
    id: string;
    name: string;
    department: string;
    unitType: string;
    standardCost: number | null;
    retailPrice: number | null;
  }>;
};

async function loadRecipeListBundle(): Promise<RecipeListBundle> {
  const [recipes, inventoryProducts] = await Promise.all([
    prisma.recipe.findMany({
      select: RECIPE_API_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.product.findMany({
      where: { isManufactured: false, catalogActive: true },
      select: INVENTORY_PRODUCTS_SELECT,
      orderBy: { name: 'asc' },
    }),
  ]);
  return { recipes, inventoryProducts };
}

export function getRecipeListBundle(): Promise<RecipeListBundle> {
  return rememberLedgerRead(recipeListCache, 'recipe-list-bundle', RECIPE_LIST_MS, loadRecipeListBundle);
}
