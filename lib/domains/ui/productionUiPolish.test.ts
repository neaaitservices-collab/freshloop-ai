import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { locationLabel } from '@/lib/domains/inventory/locationLabel';
import { batchActionLabel } from '@/lib/domains/manufacturing/batchActionLabel';
import { navItemsForRole } from '@/lib/navigation/navItems';
import { PHONE_NAV_BAR_COUNT, splitPhoneNav, visiblePhoneNavItems } from '@/lib/navigation/phoneNav';

test('phone nav keeps five items and parks the rest in More', () => {
  const admin = navItemsForRole('ADMIN');
  assert.ok(admin.length > PHONE_NAV_BAR_COUNT);
  const split = splitPhoneNav(admin);
  assert.equal(split.bar.length, PHONE_NAV_BAR_COUNT);
  assert.deepEqual(
    [...split.bar, ...split.more].map((item) => item.id),
    admin.map((item) => item.id)
  );
  assert.equal(split.more.some((item) => item.label === 'Operations'), false);
  assert.ok(split.more.some((item) => item.label === 'Orders'));

  for (const role of ['FLOOR_STAFF', 'DELI_CHEF', 'RECEIVING_CLERK'] as const) {
    const items = navItemsForRole(role);
    const phone = splitPhoneNav(items);
    assert.equal(phone.more.length, 0, role);
    assert.equal(phone.bar.length, items.length, role);
  }
});

const PHONE_POLISH_FILES = [
  'app/operations/page.tsx',
  'components/features/inventory/SubInventoryTransferBar.tsx',
  'components/features/inventory/SubInventoryTransferList.tsx',
  'components/features/operations/VolumetricScrapForm.tsx',
  'components/features/production/ProductionActiveBomPanel.tsx',
  'components/features/production/ProductionBomKpiBadges.tsx',
  'components/features/production/ProductionDashboard.tsx',
  'components/features/production/ProductionDashboardHeader.tsx',
  'components/features/production/ProductionMobileSectionNav.tsx',
  'components/features/recipes/ManualRecipeCreatorModal.tsx',
  'components/features/recipes/RecipeFusionCard.tsx',
  'components/features/recipes/RecipeProductionModal.tsx',
  'components/features/voice/VoiceLoggerModal.tsx',
  'components/layout/Navigation.tsx',
];

test('phone polish screens use at least 12px text', () => {
  for (const file of PHONE_POLISH_FILES) {
    const source = readFileSync(file, 'utf8');
    assert.equal(/text-\[(?:8|9|10|11)px\]/.test(source), false, file);
  }
});

test('phone nav omits Voice when there is no handler', () => {
  const admin = navItemsForRole('ADMIN');
  assert.equal(admin.some((item) => item.voice), true);
  const hidden = visiblePhoneNavItems(admin, false);
  assert.equal(hidden.some((item) => item.voice), false);
  assert.equal(hidden.length, admin.length - 1);
  const shown = visiblePhoneNavItems(admin, true);
  assert.equal(shown.some((item) => item.id === 'voice'), true);
  const split = splitPhoneNav(hidden);
  assert.equal([...split.bar, ...split.more].some((item) => item.voice), false);
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

test('/operations is a guarded permanent redirect to production', () => {
  const page = readFileSync('app/operations/page.tsx', 'utf8');
  const guardAt = page.indexOf("guardFreshPage('/operations')");
  const redirectAt = page.indexOf("permanentRedirect('/production')");
  assert.ok(guardAt !== -1 && redirectAt !== -1 && guardAt < redirectAt);
  assert.equal(page.includes('OperationsCenter'), false);
  for (const role of ['ADMIN', 'STORE_MANAGER'] as const) {
    const items = navItemsForRole(role);
    assert.equal(
      items.some((item) => item.id === 'operations' || item.href === '/operations'),
      false,
      role
    );
  }
});

test('production keeps the live transfer panel', () => {
  const production = readFileSync(
    'components/features/production/ProductionFloorTransfersSection.tsx',
    'utf8'
  );
  assert.equal(production.includes('KitchenFloorInbox'), false);
  assert.match(production, /Live floor & prep transfers/);
  assert.match(production, /LiveSubInventoryTransfers/);
});
