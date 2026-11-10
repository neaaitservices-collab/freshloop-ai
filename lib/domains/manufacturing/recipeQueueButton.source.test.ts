import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const card = fs.readFileSync(
  path.join(process.cwd(), 'components/features/recipes/RecipeFusionCard.tsx'),
  'utf8'
);
const catalog = fs.readFileSync(
  path.join(process.cwd(), 'components/features/production/ProductionRecipeCatalogSection.tsx'),
  'utf8'
);

test('recipe card does not claim a production queue without a queue API', () => {
  assert.equal(card.includes('Queued for Production'), false);
  assert.equal(card.includes('Queue for Production'), false);
  assert.equal(card.includes('onSendToKitchen'), false);
  assert.equal(card.includes('setSent'), false);
});

test('production catalog does not wire a local-only queue callback', () => {
  assert.equal(catalog.includes('onSendToKitchen'), false);
  assert.match(catalog, /onExecuteBatch=\{canExecuteBom \? onExecuteBatch : undefined\}/);
});
