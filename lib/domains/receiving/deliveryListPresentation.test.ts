import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  deliveryListPresentation,
  receiveInvoiceGate,
  SCAN_OR_OPEN_INVOICE_TO_RECEIVE,
} from '@/lib/domains/receiving/deliveryListPresentation';

const dashboard = fs.readFileSync(
  path.join(process.cwd(), 'components/features/receive/YieldPricingDashboard.tsx'),
  'utf8'
);

test('rows stay on screen, otherwise the list is loading, an error, or empty', () => {
  assert.equal(
    deliveryListPresentation({ rowCount: 16, loading: true, warning: 'down' }),
    'rows'
  );
  assert.equal(
    deliveryListPresentation({ rowCount: 16, loading: false, warning: null }),
    'rows'
  );
  assert.equal(
    deliveryListPresentation({
      rowCount: 0,
      loading: false,
      warning: 'Saved deliveries could not be read.',
    }),
    'error'
  );
  assert.equal(
    deliveryListPresentation({ rowCount: 0, loading: true, warning: 'Saved deliveries could not be read.' }),
    'error'
  );
  assert.equal(deliveryListPresentation({ rowCount: 0, loading: true, warning: null }), 'loading');
  assert.equal(deliveryListPresentation({ rowCount: 0, loading: false, warning: null }), 'empty');
  assert.equal(deliveryListPresentation({ rowCount: 0, loading: false, warning: '   ' }), 'empty');
});

test('with no invoice open the screen is empty and save is unavailable', () => {
  const idle = receiveInvoiceGate(false);
  assert.equal(idle.emptyMessage, 'Scan or open an invoice to receive');
  assert.equal(idle.emptyMessage, SCAN_OR_OPEN_INVOICE_TO_RECEIVE);
  assert.equal(idle.saveAvailable, false);

  const open = receiveInvoiceGate(true);
  assert.equal(open.emptyMessage, null);
  assert.equal(open.saveAvailable, true);
});

test('the receive screen shows that empty state and hides save until an invoice is open', () => {
  assert.match(dashboard, /receiveInvoiceGate\(/);
  assert.match(dashboard, /\{invoiceGate\.emptyMessage\}/);
  assert.match(dashboard, /invoiceGate\.saveAvailable && listPresentation === 'rows'/);
  const rowsAt = dashboard.indexOf("invoiceGate.saveAvailable && listPresentation === 'rows'");
  assert.ok(rowsAt >= 0);
  const rowsBranch = dashboard.slice(rowsAt);
  assert.match(rowsBranch, /onSave=/);
  const beforeRows = dashboard.slice(0, rowsAt);
  assert.equal(beforeRows.includes('onSave='), false);
  assert.equal(dashboard.includes('setLogs([])'), false);
});

test('the deliveries screen cannot render only the header', () => {
  assert.match(dashboard, /deliveryListPresentation\(/);
  assert.match(dashboard, /No deliveries recorded/);
  assert.match(dashboard, /role="alert"/);
  assert.match(dashboard, /void loadLogs\(\)/);
  assert.equal(dashboard.includes('!loading && !boardActive && !warning'), false);
  assert.equal(dashboard.includes('setLogs([])'), false);
});
