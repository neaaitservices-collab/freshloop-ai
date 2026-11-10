import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { selectManufacturingCatalog } from '@/lib/domains/manufacturing/buildCatalog';
import {
  isDatabaseUnreachableError,
  isFallbackRecipeId,
} from '@/lib/domains/manufacturing/fallbackRecipes';
import type { KitchenRecipeDefinition } from '@/lib/domains/manufacturing/types';

const saved: KitchenRecipeDefinition[] = [
  {
    recipeId: 'db-1',
    recipeName: 'Saved soup',
    category: 'Soup',
    outputProductId: 'out',
    outputProductName: 'Soup',
    standardBatchYield: 4,
    outputUnit: 'TUB',
    targetRetailPrice: 5,
    prepTimeMinutes: 10,
    laborHours: 0,
    laborRatePerHour: 0,
    packagingCostPerUnit: 0,
    bom: [],
    fallback: false,
    readOnly: false,
  },
];

const fallback: KitchenRecipeDefinition[] = [
  {
    ...saved[0],
    recipeId: 'rec-panzanella-001',
    recipeName: 'Demo',
    fallback: true,
    readOnly: true,
  },
];

test('fallback recipe ids are rejected as display-only ids', () => {
  assert.equal(isFallbackRecipeId('rec-panzanella-001'), true);
  assert.equal(isFallbackRecipeId('rec-001'), true);
  assert.equal(isFallbackRecipeId('rec-guacamole-003'), true);
  assert.equal(isFallbackRecipeId('db-recipe'), false);
  assert.equal(isDatabaseUnreachableError(Object.assign(new Error('no'), { code: 'P1001' })), true);
  assert.equal(isDatabaseUnreachableError(Object.assign(new Error('missing'), { code: 'P2025' })), false);
});

test('an empty or missing recipe list is not a fallback catalog', () => {
  assert.deepEqual(
    selectManufacturingCatalog({ error: null, saved: [], fallback }),
    []
  );
  assert.deepEqual(
    selectManufacturingCatalog({ error: null, saved, fallback }),
    saved
  );
  assert.throws(
    () =>
      selectManufacturingCatalog({
        error: Object.assign(new Error('Record not found'), { code: 'P2025' }),
        saved: [],
        fallback,
      }),
    (error: unknown) => !isDatabaseUnreachableError(error)
  );
});

test('a connection error returns read-only fallback recipes', () => {
  const recipes = selectManufacturingCatalog({
    error: Object.assign(new Error("Can't reach database server"), { code: 'P1001' }),
    saved: [],
    fallback,
  });
  assert.equal(recipes.length, 1);
  assert.equal(recipes[0]?.fallback, true);
  assert.equal(recipes[0]?.readOnly, true);
});

test('execute path rejects fallback ids before a stock write, and the UI hides execute', () => {
  const execute = readFileSync('lib/domains/manufacturing/executeBatch.ts', 'utf8');
  const rejectAt = execute.indexOf('isFallbackRecipeId(recipeId)');
  const lookupAt = execute.indexOf('prisma.recipe.findUnique');
  const writeAt = execute.indexOf('prisma.$transaction');
  assert.ok(rejectAt > 0 && rejectAt < lookupAt && lookupAt < writeAt);
  assert.equal(execute.includes('FALLBACK_RECIPES'), false);
  assert.match(execute, /Recipe not found/);

  const modal = readFileSync('components/features/recipes/RecipeProductionModal.tsx', 'utf8');
  assert.match(modal, /Recipes unavailable, retry/);
  assert.match(modal, />\s*Retry\s*</);
  assert.equal(modal.includes('KITCHEN_RECIPES_CATALOG'), false);
  assert.equal(modal.includes('rec-panzanella-001'), false);
  assert.match(modal, /!catalogUnavailable && selectedRecipe && !completedBatch/);

  const panel = readFileSync('components/features/production/ProductionActiveBomPanel.tsx', 'utf8');
  assert.match(panel, /Recipes unavailable, retry/);
  assert.match(panel, /canExecuteBatch && !catalogReadOnly/);
});
