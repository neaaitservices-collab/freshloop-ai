import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  STANDARD_COST_FALLBACK_NOTE,
  computeScaledBatchCost,
  ingredientUsesStandardCostFallback,
} from '@/lib/domains/manufacturing/batchCost';
import { DEFAULT_LABOR_RATE_NOTE } from '@/lib/domains/manufacturing/resolveLaborRate';

test('scaled batch breakdown adds up to the total and the unit cost', () => {
  const cost = computeScaledBatchCost({
    ingredientCost: 1.13,
    laborHours: 0.5,
    laborRatePerHour: 17.6,
    packagingCostPerUnit: 0.85,
    standardYield: 4,
    actualBatchOutput: 2,
  });
  assert.equal(cost.ingredientCost, 1.13);
  assert.equal(cost.laborCost, 4.4);
  assert.equal(cost.packagingCost, 1.7);
  assert.equal(
    Number((cost.ingredientCost + cost.laborCost + cost.packagingCost).toFixed(4)),
    cost.totalBatchCost
  );
  assert.equal(cost.totalBatchCost, 7.23);
  assert.equal(cost.unitCost, Number((cost.totalBatchCost / 2).toFixed(4)));
  assert.equal(cost.laborRateIsDefault, false);
  assert.deepEqual(cost.standardCostFallbacks, []);
});

test('the $2 standardCost fallback flag is set when cost is not on file', () => {
  assert.equal(
    ingredientUsesStandardCostFallback({ movingAverageCost: null, standardCost: null }),
    true
  );
  assert.equal(
    ingredientUsesStandardCostFallback({ movingAverageCost: undefined, standardCost: undefined }),
    true
  );
  assert.equal(
    ingredientUsesStandardCostFallback({ movingAverageCost: null, standardCost: 2 }),
    false
  );
  assert.equal(
    ingredientUsesStandardCostFallback({ movingAverageCost: 1.13, standardCost: null }),
    false
  );
  assert.equal(
    ingredientUsesStandardCostFallback({ movingAverageCost: null, standardCost: 0 }),
    false
  );

  const cost = computeScaledBatchCost({
    ingredientCost: 2,
    laborHours: 0,
    laborRatePerHour: 17.6,
    packagingCostPerUnit: 0,
    standardYield: 1,
    actualBatchOutput: 1,
    laborRateIsDefault: true,
    ingredients: [
      {
        ingredientProductId: 'mango',
        name: 'Ataulfo Mangoes',
        movingAverageCost: 4.5,
        standardCost: 4.5,
      },
      {
        ingredientProductId: 'gala',
        name: 'Gala',
        movingAverageCost: null,
        standardCost: null,
      },
    ],
  });
  assert.equal(cost.totalBatchCost, 2);
  assert.equal(cost.unitCost, 2);
  assert.equal(cost.laborRateIsDefault, true);
  assert.equal(cost.standardCostFallbacks.length, 1);
  assert.equal(cost.standardCostFallbacks[0]?.standardCostFallback, true);
  assert.equal(cost.standardCostFallbacks[0]?.name, 'Gala');
  assert.equal(cost.standardCostFallbacks[0]?.unitCost, 2);
  assert.equal(STANDARD_COST_FALLBACK_NOTE, 'est. $2.00, no cost on file');
});

test('production batch sheet shows the cost breakdown and fallback notes', () => {
  const modal = readFileSync('components/features/recipes/RecipeProductionModal.tsx', 'utf8');
  assert.match(modal, /Ingredients/);
  assert.match(modal, /Labor/);
  assert.match(modal, /Packaging/);
  assert.match(modal, /batchCost\.ingredientCost/);
  assert.match(modal, /batchCost\.laborCost/);
  assert.match(modal, /batchCost\.packagingCost/);
  assert.match(modal, /batchCost\.totalBatchCost/);
  assert.match(modal, /batchCost\.unitCost/);
  assert.match(modal, /STANDARD_COST_FALLBACK_NOTE/);
  assert.match(modal, /DEFAULT_LABOR_RATE_NOTE/);
  assert.match(modal, /standardCostFallbacks/);
  assert.match(modal, /laborRateIsDefault/);
  assert.equal(DEFAULT_LABOR_RATE_NOTE, 'Default labor rate');
  assert.equal(/\bkitchen\b/i.test(modal.slice(modal.indexOf('Ingredients'))), false);
});
