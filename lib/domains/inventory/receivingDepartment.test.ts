import assert from 'node:assert/strict';
import test from 'node:test';
import {
  receivingDepartmentFieldErrors,
  receivingLineNeedsDepartmentPick,
  resolveReceivingDepartment,
} from '@/lib/domains/inventory/receivingDepartment';

test('dairy, bakery, and pantry lines map from the item name', () => {
  assert.equal(resolveReceivingDepartment({ itemName: 'Whole Milk' }), 'DAIRY');
  assert.equal(resolveReceivingDepartment({ itemName: 'Sourdough Loaf' }), 'BAKERY');
  assert.equal(resolveReceivingDepartment({ itemName: 'Olive Oil' }), 'PANTRY');
});

test('a produce line stays produce and a deli line is not left out', () => {
  assert.equal(resolveReceivingDepartment({ itemName: 'Lemons' }), 'PRODUCE');
  assert.equal(resolveReceivingDepartment({ itemName: 'Rotisserie Chicken' }), 'DELI_KITCHEN');
});

test('an unknown item does not become produce', () => {
  assert.equal(resolveReceivingDepartment({ itemName: 'Mystery Gadget' }), null);
});

test('an explicit department wins over the item name', () => {
  assert.equal(
    resolveReceivingDepartment({ itemName: 'Whole Milk', explicitDepartment: 'BAKERY' }),
    'BAKERY'
  );
  assert.equal(
    resolveReceivingDepartment({ itemName: 'Whole Milk', explicitDepartment: 'DELI_KITCHEN' }),
    'DELI_KITCHEN'
  );
});

test('supplier and category are used before the name, and an assumed department is not a choice', () => {
  assert.equal(
    resolveReceivingDepartment({ itemName: 'House Brand 12', supplier: 'North Dairy' }),
    'DAIRY'
  );
  assert.equal(
    resolveReceivingDepartment({ itemName: 'Item 12', category: 'Bakery' }),
    'BAKERY'
  );
  assert.equal(
    resolveReceivingDepartment({
      itemName: 'Whole Milk',
      explicitDepartment: 'PRODUCE',
      departmentAssumed: true,
    }),
    'DAIRY'
  );
});

test('an unclear line with no pick blocks the save, and a pick clears only that line', () => {
  const lines = [
    { itemName: 'Whole Milk', externalLogId: 'milk' },
    { itemName: 'Mystery Gadget', externalLogId: 'gadget' },
  ];
  const blocked = receivingDepartmentFieldErrors(lines, []);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0]?.field, 'department');
  assert.equal(blocked[0]?.itemName, 'Mystery Gadget');
  assert.equal(receivingLineNeedsDepartmentPick({ itemName: 'Mystery Gadget' }), true);
  assert.equal(receivingLineNeedsDepartmentPick({ itemName: 'Lemons' }), false);
  const picked = receivingDepartmentFieldErrors(
    lines.map((line) =>
      line.externalLogId === 'gadget' ? { ...line, screenDepartment: 'DELI_KITCHEN' } : line
    ),
    []
  );
  assert.deepEqual(picked, []);
});

test('an unclear item uses the receive-screen department', () => {
  assert.equal(
    resolveReceivingDepartment({ itemName: 'Mystery Gadget', screenDepartment: 'DELI_KITCHEN' }),
    'DELI_KITCHEN'
  );
  assert.equal(
    resolveReceivingDepartment({
      itemName: 'Whole Milk',
      screenDepartment: 'PANTRY',
    }),
    'DAIRY'
  );
});
