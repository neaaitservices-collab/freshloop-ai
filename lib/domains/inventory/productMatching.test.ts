import assert from 'node:assert/strict';
import test from 'node:test';
import {
  catalogDuplicateScore,
  identityTokens,
  matchProduct,
  scoreProductMatch,
} from '@/lib/domains/inventory/productMatching';

const catalog = [
  { id: '1', name: 'AVOCADO-MEX HASS 32' },
  { id: '2', name: 'Avocados Hass' },
  { id: '3', name: 'BLACKBERRIES 1/2 PINTS' },
  { id: '4', name: 'Blackberries (170g)' },
  { id: '5', name: '10LB GOLDEN BEETS PRODUCT OF CANADA CANADA NO.1' },
  { id: '6', name: 'Golden Beets' },
];

test('invoice avocados match the readable Hass SKU, not the pack-coded duplicate', () => {
  const match = matchProduct('Avocados Hass (Mexico) — 36 ct case', catalog);
  assert.equal(match?.id, '2');
});

test('ALL CAPS avocado invoice lines still resolve to Hass avocados', () => {
  const match = matchProduct('AVOCADO-MEX HASS 48', catalog);
  assert.ok(match?.name.toLowerCase().includes('avocado') || match?.name.toLowerCase().includes('hass'));
  assert.equal(match?.id, '2');
});

test('blackberry naming variants converge on one catalog row', () => {
  const a = matchProduct('BLACKBERRIES 1/2 PINTS', catalog);
  const b = matchProduct('Blackberries 170g tub', catalog);
  assert.equal(a?.id, b?.id);
});

test('beets ignore weight prefix on invoice', () => {
  const match = matchProduct('10LB GOLDEN BEETS PRODUCT OF CANADA', catalog);
  assert.ok(match?.name.toLowerCase().includes('beet'));
});

test('pack weight prefixes do not block produce matches', () => {
  const catalog = [{ id: 'c', name: '15KG CLEMENTINES' }];
  const match = matchProduct('15KG CLEMENTINES', catalog);
  assert.equal(match?.id, 'c');
  const tokens = identityTokens('15KG CLEMENTINES');
  assert.ok(!tokens.some((t) => /^\d+kg$/.test(t)));
});

test('unrelated items do not match', () => {
  assert.equal(scoreProductMatch('Whole Heavy Cream 40%', 'Avocados Hass'), 0);
});

test('a short invoice name does not bind to a longer catalog SKU', () => {
  assert.ok(scoreProductMatch('Red Pepper', 'Red Pepper Hummus') <= 50);
  assert.equal(matchProduct('Red Pepper', [{ id: 'hummus', name: 'Red Pepper Hummus' }]), null);
  assert.equal(
    matchProduct('Red Pepper', [
      { id: 'pepper', name: 'Red Pepper' },
      { id: 'hummus', name: 'Red Pepper Hummus' },
    ])?.id,
    'pepper'
  );
  assert.equal(matchProduct('Dill', [{ id: 'pickles', name: 'Dill Pickles' }]), null);
  assert.equal(matchProduct('Organic Bananas', [{ id: 'chips', name: 'Banana Chips' }]), null);
});

test('catalog duplicate score rejects substring false friends', () => {
  assert.equal(catalogDuplicateScore('DILL', 'GRANADILLA-COL 2.5KG'), 0);
  assert.equal(catalogDuplicateScore('Granola - Lemon Poppyseed', 'LEMONS 75'), 0);
  assert.ok(catalogDuplicateScore('Avocados Hass', 'AVOCADO-MEX HASS 32') >= 85);
});
