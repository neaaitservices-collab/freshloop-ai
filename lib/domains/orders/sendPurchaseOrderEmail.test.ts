import assert from 'node:assert/strict';
import test from 'node:test';
import { singleSupplierEmail } from '@/components/features/orders/supplierMail';
import {
  formatPurchaseOrderFrom,
  purchaseOrderEmailConfig,
  purchaseOrderFromAddress,
  purchaseOrderReplyTo,
} from '@/lib/domains/orders/sendPurchaseOrderEmail';

test('purchase order From uses the staff display name and one address', () => {
  assert.equal(purchaseOrderFromAddress('orders@freshloop.test'), 'orders@freshloop.test');
  assert.equal(
    purchaseOrderFromAddress('FreshLoop Orders <orders@freshloop.test>'),
    'orders@freshloop.test'
  );
  assert.equal(purchaseOrderFromAddress('a@b.test, c@d.test'), null);

  assert.equal(
    formatPurchaseOrderFrom('Jane Doe', 'orders@freshloop.test'),
    'Jane Doe <orders@freshloop.test>'
  );
  assert.equal(
    formatPurchaseOrderFrom('Doe, Jane', 'orders@freshloop.test'),
    '"Doe, Jane" <orders@freshloop.test>'
  );
  assert.equal(
    formatPurchaseOrderFrom('Jane "JD" Doe', 'orders@freshloop.test'),
    '"Jane \\"JD\\" Doe" <orders@freshloop.test>'
  );
  assert.equal(formatPurchaseOrderFrom('Jane\nDoe', 'orders@freshloop.test'), 'Jane Doe <orders@freshloop.test>');
  assert.equal(formatPurchaseOrderFrom('   ', 'orders@freshloop.test'), 'orders@freshloop.test');
});

test('Reply-To uses the staff email, then PO_REPLY_TO, then nothing', () => {
  assert.equal(purchaseOrderReplyTo('jane@store.test', 'desk@freshloop.test'), 'jane@store.test');
  assert.equal(purchaseOrderReplyTo('', 'desk@freshloop.test'), 'desk@freshloop.test');
  assert.equal(purchaseOrderReplyTo('not-an-email', 'desk@freshloop.test'), 'desk@freshloop.test');
  assert.equal(purchaseOrderReplyTo('', undefined), null);
  assert.equal(purchaseOrderReplyTo('jane@store.test, other@store.test', 'desk@freshloop.test'), 'desk@freshloop.test');
});

test('purchase order mail settings do not require PO_REPLY_TO', () => {
  const previous = {
    from: process.env.PO_FROM_EMAIL,
    reply: process.env.PO_REPLY_TO,
    key: process.env.RESEND_API_KEY,
  };
  try {
    process.env.PO_FROM_EMAIL = 'orders@freshloop.test';
    delete process.env.PO_REPLY_TO;
    process.env.RESEND_API_KEY = 're_test_key';
    const ready = purchaseOrderEmailConfig();
    assert.equal(ready.ok, true);
    if (ready.ok) assert.equal(ready.fromAddress, 'orders@freshloop.test');

    delete process.env.PO_FROM_EMAIL;
    delete process.env.RESEND_API_KEY;
    const missing = purchaseOrderEmailConfig();
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.match(missing.error, /PO_FROM_EMAIL/);
      assert.match(missing.error, /RESEND_API_KEY/);
      assert.equal(missing.error.includes('PO_REPLY_TO'), false);
    }
  } finally {
    if (previous.from === undefined) delete process.env.PO_FROM_EMAIL;
    else process.env.PO_FROM_EMAIL = previous.from;
    if (previous.reply === undefined) delete process.env.PO_REPLY_TO;
    else process.env.PO_REPLY_TO = previous.reply;
    if (previous.key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previous.key;
  }
});

test('one supplier address rejects lists and display-name wrappers', () => {
  assert.equal(singleSupplierEmail(' buyer@farm.test '), 'buyer@farm.test');
  assert.equal(singleSupplierEmail('buyer@farm.test, other@farm.test'), null);
  assert.equal(singleSupplierEmail('buyer@farm.test;other@farm.test'), null);
  assert.equal(singleSupplierEmail('Jane Doe <buyer@farm.test>'), null);
  assert.equal(singleSupplierEmail(''), null);
});
