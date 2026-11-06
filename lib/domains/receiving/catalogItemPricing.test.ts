import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPresetMarginToUnitPrice,
  formatUnitPriceFromCase,
  grossMarginPercent,
  parseCatalogPriceInput,
} from '@/lib/domains/receiving/catalogItemPricing';

test('parseCatalogPriceInput rejects invalid and empty', () => {
  assert.equal(parseCatalogPriceInput(''), null);
  assert.equal(parseCatalogPriceInput('abc'), null);
  assert.equal(parseCatalogPriceInput('3.5'), 3.5);
});

test('preset 40%: unit = cost / 0.60 only', () => {
  const unitPrice = applyPresetMarginToUnitPrice({ mode: '40', unitCost: 2.1 });
  assert.equal(unitPrice, '3.50');
  assert.equal(grossMarginPercent(3.5, 2.1), 40);
});

test('unit from case: case ÷ sellable (pack ÷ split)', () => {
  assert.equal(formatUnitPriceFromCase(35, 40, 4), '3.50');
  assert.equal(formatUnitPriceFromCase(3.5, 1, 1), '3.50');
});
