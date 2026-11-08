import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ledgerPath = path.join(process.cwd(), 'lib/domains/inventory/ledger.ts');
const ledger = fs.readFileSync(ledgerPath, 'utf8');

test('waste sales path stays on per-line realized revenue after conflict merges', () => {
  assert.equal(ledger.includes('salesTimeSql'), false);
  assert.equal(ledger.includes('p."retailPrice"'), false);
  assert.equal(ledger.includes('ABS(t."Qty_Change") * t."Unit_Cost_At_Time"'), false);
  assert.equal(ledger.includes('t."extended_revenue"'), false);
  assert.equal(ledger.includes('recorded?'), false);
  assert.match(ledger, /sumRecognizedGrossSales\(saleLines\)/);
  assert.match(ledger, /realizedLineRevenue:\s*true/);
  assert.match(ledger, /realizedLineRevenue:\s*plan\.recorded\.realizedLineRevenue/);
  assert.match(ledger, /ABS\("Qty_Change"\) \* "Unit_Cost_At_Time"/);
});
