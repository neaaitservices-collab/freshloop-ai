import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/** Guard must appear before the sensitive call inside the same async function. */
const boundaries: Array<[string, string]> = [
  ['app/orders/page.tsx', 'loadOrdersBuyList('],
  ['app/receive/page.tsx', 'listReceivingDeliveryLogs('],
  ['app/inventory/page.tsx', 'getStockLevels('],
  ['app/inventory/floor/page.tsx', 'getStockLevels('],
  ['app/admin/page.tsx', 'getAdminStoreStatsBundle('],
  ['app/admin/settings/page.tsx', 'getPlatformSettings('],
  ['app/admin/executive/page.tsx', 'getAdminStoreStatsBundle('],
  ['app/admin/suppliers/page.tsx', 'listSuppliers('],
  ['app/admin/departments/page.tsx', 'loadAdminDepartments('],
];

test('protected pages guard before sensitive loaders', () => {
  for (const [file, loader] of boundaries) {
    const src = readFileSync(file, 'utf8');
    const parts = src.split(/(?=async function |export default async function )/);
    const owners = parts.filter((part) => part.includes(loader));
    assert.ok(owners.length > 0, `${file} no longer calls ${loader}`);
    for (const part of owners) {
      const guardAt = part.indexOf('guardFreshPage');
      const loadAt = part.indexOf(loader);
      assert.ok(guardAt !== -1 && guardAt < loadAt, `${file} calls ${loader} before guardFreshPage`);
    }
  }
});
