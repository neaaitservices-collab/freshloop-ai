import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const route = fs.readFileSync(path.join(process.cwd(), 'app/api/manufacturing/route.ts'), 'utf8');
const execute = fs.readFileSync(
  path.join(process.cwd(), 'lib/domains/manufacturing/executeBatch.ts'),
  'utf8'
);

test('manufacturing route delegates batch identity to the domain transaction', () => {
  assert.equal(route.includes('Date.now()'), false);
  assert.match(route, /executeManufacturingBatch/);
  assert.match(route, /operationId: parsed\.operation_id/);
});

test('operation row is inserted before stock consumption in the same function', () => {
  const createAt = execute.indexOf('tx.manufacturingOperation.create');
  const consumeAt = execute.indexOf('await consumeLotsFifo');
  const updateAt = execute.indexOf('tx.manufacturingOperation.update');
  assert.ok(createAt > 0);
  assert.ok(createAt < consumeAt);
  assert.ok(consumeAt < updateAt);
  assert.match(execute, /allowShort: false/);
  assert.equal(execute.includes('MFG-${Date.now()'), false);
  assert.match(execute, /manufacturingBatchReferenceId\(operationId\)/);
});
