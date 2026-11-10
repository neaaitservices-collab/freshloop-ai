import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  INVOICE_IDENTITY_NETWORK_ERROR,
  SUPPLIER_REQUIRED_ERROR,
} from '@/lib/domains/receiving/invoiceDeliveryId';
import {
  RECIPE_LOAD_ERROR,
  RECIPE_LOAD_NETWORK_ERROR,
  STAFF_ROSTER_LOAD_ERROR,
  STOCK_REFRESH_ERROR,
  STOCK_REFRESH_NETWORK_ERROR,
  listLoadFailure,
} from '@/lib/domains/http/clientLoadFailure';

test('a failed list load is an error, and an empty success is not', () => {
  assert.equal(listLoadFailure(true, { success: true, recipes: [] }, 'recipes', RECIPE_LOAD_ERROR), null);
  assert.equal(
    listLoadFailure(false, { success: false, error: 'Not signed in.' }, 'recipes', RECIPE_LOAD_ERROR),
    'Not signed in.'
  );
  assert.equal(listLoadFailure(false, null, 'levels', STOCK_REFRESH_ERROR), STOCK_REFRESH_ERROR);
  assert.equal(listLoadFailure(true, { success: false }, 'users', STAFF_ROSTER_LOAD_ERROR), STAFF_ROSTER_LOAD_ERROR);
});

test('network wording does not describe a missing supplier or an empty kitchen', () => {
  assert.match(INVOICE_IDENTITY_NETWORK_ERROR, /not a missing supplier/i);
  assert.doesNotMatch(INVOICE_IDENTITY_NETWORK_ERROR, /Select a saved supplier/);
  assert.notEqual(INVOICE_IDENTITY_NETWORK_ERROR, SUPPLIER_REQUIRED_ERROR);
  assert.match(RECIPE_LOAD_NETWORK_ERROR, /connection failed/i);
  assert.match(STOCK_REFRESH_NETWORK_ERROR, /connection failed/i);
  assert.match(STAFF_ROSTER_LOAD_ERROR, /roster/i);
});

test('failure screens use the load error instead of an empty-state claim', () => {
  const dashboard = fs.readFileSync(
    path.join(process.cwd(), 'components/features/production/ProductionDashboard.tsx'),
    'utf8'
  );
  const bom = fs.readFileSync(
    path.join(process.cwd(), 'components/features/production/ProductionActiveBomPanel.tsx'),
    'utf8'
  );
  const catalog = fs.readFileSync(
    path.join(process.cwd(), 'components/features/production/ProductionRecipeCatalogSection.tsx'),
    'utf8'
  );
  const floor = fs.readFileSync(
    path.join(process.cwd(), 'components/features/inventory/FloorTransferPage.tsx'),
    'utf8'
  );
  const clerk = fs.readFileSync(
    path.join(process.cwd(), 'components/features/inventory/ClerkStockView.tsx'),
    'utf8'
  );
  const roles = fs.readFileSync(path.join(process.cwd(), 'components/auth/RoleProvider.tsx'), 'utf8');
  const receive = fs.readFileSync(
    path.join(process.cwd(), 'components/features/receive/ReceiveScreen.tsx'),
    'utf8'
  );

  assert.match(dashboard, /listLoadFailure\(bomRes\.ok, bomJson, 'recipes'/);
  assert.match(dashboard, /RECIPE_LOAD_NETWORK_ERROR/);
  assert.match(bom, /loadError/);
  assert.match(catalog, /loadError/);
  assert.match(floor, /STOCK_REFRESH_NETWORK_ERROR/);
  assert.match(clerk, /STOCK_REFRESH_NETWORK_ERROR/);
  assert.match(roles, /STAFF_ROSTER_LOAD_ERROR/);
  const rosterFailure = roles.slice(roles.indexOf('if (list)'), roles.indexOf('}, [activeUser]'));
  assert.match(rosterFailure, /setRosterError\(STAFF_ROSTER_LOAD_ERROR\)/);
  assert.equal(rosterFailure.includes('setUsers([activeUser])'), false);

  const identityCatch = receive.slice(receive.indexOf("fetch('/api/receiving-invoices/identity'"));
  const catchBody = identityCatch.slice(identityCatch.indexOf('.catch('), identityCatch.indexOf('.catch(') + 500);
  assert.match(catchBody, /INVOICE_IDENTITY_NETWORK_ERROR/);
  assert.equal(catchBody.includes('SUPPLIER_REQUIRED_ERROR'), false);
});
