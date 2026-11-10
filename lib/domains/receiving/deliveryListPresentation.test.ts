import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { deliveryListPresentation } from '@/lib/domains/receiving/deliveryListPresentation';

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

test('the deliveries screen cannot render only the header', () => {
  assert.match(dashboard, /deliveryListPresentation\(/);
  assert.match(dashboard, /No deliveries recorded/);
  assert.match(dashboard, /role="alert"/);
  assert.match(dashboard, /void loadLogs\(\)/);
  assert.equal(dashboard.includes('!loading && !boardActive && !warning'), false);
  assert.equal(dashboard.includes('setLogs([])'), false);
});
