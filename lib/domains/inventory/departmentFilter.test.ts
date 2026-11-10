import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { matchesStoredDepartment } from '@/lib/domains/inventory/inventoryCatalog';

test('department filters use the stored department, not a name guess', () => {
  assert.equal(matchesStoredDepartment('DAIRY', 'ALL'), true);
  assert.equal(matchesStoredDepartment('DAIRY', 'DAIRY'), true);
  assert.equal(matchesStoredDepartment('PRODUCE', 'DAIRY'), false);
  assert.equal(matchesStoredDepartment('PRODUCE', 'PRODUCE'), true);
  for (const file of ['FloorTransferPage.tsx', 'SlateInventory.tsx']) {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/features/inventory', file),
      'utf8'
    );
    assert.equal(source.includes('departmentForName'), false);
    assert.match(source, /matchesStoredDepartment\(row\.department, department\)/);
  }
});
