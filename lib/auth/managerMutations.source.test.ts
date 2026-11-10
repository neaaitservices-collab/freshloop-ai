import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const move = fs.readFileSync(path.join(process.cwd(), 'app/api/inventory/move/route.ts'), 'utf8');
const levels = fs.readFileSync(path.join(process.cwd(), 'app/api/inventory/levels/route.ts'), 'utf8');
const credit = fs.readFileSync(
  path.join(process.cwd(), 'app/api/receiving-dispositions/[id]/route.ts'),
  'utf8'
);
const panel = fs.readFileSync(
  path.join(process.cwd(), 'components/features/receive/PendingVendorCreditsPanel.tsx'),
  'utf8'
);
const dashboard = fs.readFileSync(
  path.join(process.cwd(), 'components/features/receive/YieldPricingDashboard.tsx'),
  'utf8'
);

function markdownBranch(source: string): string {
  const start = source.indexOf("=== 'markdown'");
  assert.ok(start > 0);
  return source.slice(start, start + 280);
}

test('stock markdown calls the manager role guard before the price change', () => {
  for (const source of [move, levels]) {
    const branch = markdownBranch(source);
    assert.match(branch, /await requireManagerStaff\(\)/);
    const guardAt = branch.indexOf('requireManagerStaff');
    const applyAt = branch.indexOf('applyRetailMarkdown');
    assert.ok(guardAt > 0 && guardAt < applyAt);
  }
});

test('vendor credit resolve is manager-only and the button stays disabled otherwise', () => {
  assert.match(credit, /requireManagerStaff\(\)/);
  assert.equal(credit.includes('requireReceivingStaff'), false);
  assert.match(panel, /disabled=\{!canResolve/);
  assert.match(panel, /Store manager only/);
  assert.match(dashboard, /canResolve=\{canResolveVendorCredit\}/);
  assert.match(dashboard, /canManageStaff\(activeUser\?\.role\)/);
});
