import assert from 'node:assert/strict';
import test from 'node:test';
import { findDuplicateCatalogGroups, pickPrimaryProduct } from '@/lib/domains/inventory/catalogMerge';

test('findDuplicateCatalogGroups clusters avocado and blackberry variants', () => {
  const products = [
    { id: 'a1', name: 'AVOCADO-MEX HASS 32', department: 'PRODUCE', onHand: 0 },
    { id: 'a2', name: 'Avocados Hass', department: 'PRODUCE', onHand: 5 },
    { id: 'b1', name: 'BLACKBERRIES 1/2 PINTS', department: 'PRODUCE', onHand: 1 },
    { id: 'b2', name: 'Blackberries (170g)', department: 'PRODUCE', onHand: 0 },
    { id: 'c1', name: 'Whole Heavy Cream 40%', department: 'DAIRY', onHand: 9 },
  ];
  const groups = findDuplicateCatalogGroups(products, 85);
  assert.equal(groups.length, 2);
  const avocado = groups.find((g) => g.primaryName.toLowerCase().includes('avocado'));
  assert.ok(avocado);
  assert.equal(avocado?.primaryId, 'a2');
  assert.equal(avocado?.members.length, 2);
});

test('pickPrimaryProduct prefers readable title and higher on-hand', () => {
  const primary = pickPrimaryProduct([
    { id: '1', name: 'AVOCADO-MEX HASS 32', department: 'PRODUCE', onHand: 10 },
    { id: '2', name: 'Avocados Hass', department: 'PRODUCE', onHand: 2 },
  ]);
  assert.equal(primary.id, '2');
});
