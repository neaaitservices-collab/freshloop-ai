import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { locationLabel } from '@/lib/domains/inventory/locationLabel';
import { batchActionLabel } from '@/lib/domains/manufacturing/batchActionLabel';
import { navItemsForRole } from '@/lib/navigation/navItems';
import { PHONE_NAV_BAR_COUNT, splitPhoneNav } from '@/lib/navigation/phoneNav';

test('phone nav keeps five items and parks the rest in More', () => {
  const admin = navItemsForRole('ADMIN');
  assert.ok(admin.length > PHONE_NAV_BAR_COUNT);
  const split = splitPhoneNav(admin);
  assert.equal(split.bar.length, PHONE_NAV_BAR_COUNT);
  assert.deepEqual(
    [...split.bar, ...split.more].map((item) => item.id),
    admin.map((item) => item.id)
  );
  assert.ok(split.more.some((item) => item.label === 'Operations'));

  for (const role of ['FLOOR_STAFF', 'DELI_CHEF', 'RECEIVING_CLERK'] as const) {
    const items = navItemsForRole(role);
    const phone = splitPhoneNav(items);
    assert.equal(phone.more.length, 0, role);
    assert.equal(phone.bar.length, items.length, role);
  }
});

test('location labels are display-only and production locations share one name', () => {
  assert.equal(locationLabel('Retail_Floor'), 'Sales floor');
  assert.equal(locationLabel('Kitchen_Prep'), 'Production');
  assert.equal(locationLabel('Deli_Grab_N_Go'), 'Production');
  assert.equal(locationLabel('Waste_Bin'), 'Waste');
  assert.equal(locationLabel('Retail_Floor').includes('_'), false);
});

test('execute-batch footer uses a plain Make label', () => {
  assert.equal(batchActionLabel(20, 'TUB'), 'Make 20 tubs');
  assert.equal(batchActionLabel(1, 'TUB'), 'Make 1 tub');
  assert.equal(batchActionLabel(2, 'LOAF'), 'Make 2 loaves');
  const modal = readFileSync('components/features/recipes/RecipeProductionModal.tsx', 'utf8');
  assert.match(modal, /batchActionLabel\(/);
  assert.equal(modal.includes('Execute batch (+'), false);
  const bom = readFileSync('components/features/production/ProductionActiveBomPanel.tsx', 'utf8');
  assert.equal(bom.includes('Execute BOM'), false);
  assert.match(bom, /Execute batch/);
});

test('operations links to production and does not mount a second transfer panel', () => {
  const ops = readFileSync('components/features/operations/OperationsCenter.tsx', 'utf8');
  assert.equal(ops.includes('OperationsLiveTransfers'), false);
  assert.match(ops, /href="\/production"/);
  const page = readFileSync('app/operations/page.tsx', 'utf8');
  assert.equal(page.includes('getStockLevels'), false);
  const production = readFileSync(
    'components/features/production/ProductionFloorTransfersSection.tsx',
    'utf8'
  );
  assert.match(production, /KitchenFloorInbox/);
  assert.match(production, /LiveSubInventoryTransfers/);
});
