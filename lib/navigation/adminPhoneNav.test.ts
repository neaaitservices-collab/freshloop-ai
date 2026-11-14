import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { phoneBarItems, PHONE_NAV_HOMES } from '@/lib/navigation/phoneNav';
import { navItemsForRole } from '@/lib/navigation/navItems';

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

test('settings page holds store settings, staff, profile, and the orders home', () => {
  const page = read('app/admin/settings/page.tsx');
  assert.match(page, /SettingsForm/);
  assert.match(page, /UserManagementTable/);
  assert.match(page, /ProfileForm/);
  assert.match(page, /id="orders"/);
  assert.match(page, /id="staff"/);
  assert.match(page, /href="\/orders"/);
  assert.match(page, /guardFreshPage\('\/admin\/settings'\)/);
  assert.equal(/\bkitchen\b/i.test(page), false);
  assert.equal(page.includes('prisma'), false);
});

test('overview is stats and alerts, and the catalogue bookmark leaves admin', () => {
  const page = read('app/admin/page.tsx');
  const figures = read('components/features/admin/DashboardFigures.tsx');
  const inventory = read('app/inventory/page.tsx');
  assert.match(page, /AdminSectionHeader/);
  assert.match(page, /DashboardFigures/);
  assert.match(page, /CatalogBookmarkRedirect/);
  assert.equal(page.includes('CaseBoard'), false);
  assert.equal(page.includes('StoreSettingsEntryCard'), false);
  assert.equal(page.includes('Operations'), false);
  assert.match(figures, /orderAlertHref/);
  assert.match(figures, /below par ›/);
  assert.match(figures, /short-dated ›/);
  assert.match(figures, /Order ›/);
  assert.match(figures, /alert: 'below-par'/);
  assert.match(figures, /alert: 'short-dated'/);
  assert.match(figures, /alert: 'flagged'/);
  assert.equal(inventory.includes("redirect('/admin#inventory-catalog')"), false);
  assert.match(inventory, /isManager\(user\.role\)/);
  assert.match(inventory, /<CaseBoard levels=\{levels\} showReceipt \/>/);
  assert.equal(read('app/admin/users/page.tsx').includes("redirect('/admin/settings#staff')"), true);
});

test('the phone bar does not keep More, and orders stay reachable from settings', () => {
  const nav = read('components/layout/Navigation.tsx');
  assert.equal(nav.includes('aria-label="More"'), false);
  assert.equal(nav.includes('phoneBarItems'), true);
  assert.equal(nav.includes('splitPhoneNav'), false);
  const admin = navItemsForRole('ADMIN');
  const bar = phoneBarItems(admin, true);
  assert.equal(bar.some((item) => item.id === 'orders' || item.id === 'suppliers'), false);
  assert.equal(admin.some((item) => item.href === PHONE_NAV_HOMES.suppliers), true);
  assert.equal(admin.some((item) => item.href === '/orders'), true);
  assert.equal(admin.some((item) => item.href === '/inventory'), true);
});

test('order screen reads the alert query and drafts those lines', () => {
  const page = read('app/orders/page.tsx');
  const list = read('components/features/orders/BuyList.tsx');
  assert.match(page, /parseOrderAlertSearch/);
  assert.match(page, /alertFocus=\{alertFocus\}/);
  assert.match(list, /rowsForOrderAlert/);
  assert.match(list, /draftsForSuppliers/);
  assert.match(list, /Boolean\(alertFocus\)/);
  assert.equal(/\bkitchen\b/i.test(list), false);
});

test('receiving staff keep Add supplier on Receive', () => {
  const screen = read('components/features/receive/ReceiveScreen.tsx');
  assert.match(screen, /Add supplier/);
  const addAt = screen.indexOf('function AddReceiveSupplier');
  assert.ok(addAt > 0);
  assert.match(screen.slice(addAt), /fetch\('\/api\/receiving-suppliers'/);
  assert.equal(screen.slice(addAt).includes("fetch('/api/admin/suppliers'"), false);
  const inline = read('components/features/receive/InlineInvoiceSupplier.tsx');
  assert.match(inline, /fetch\('\/api\/receiving-suppliers'/);
});
