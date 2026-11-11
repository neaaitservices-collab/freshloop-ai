import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  AMBIGUOUS_SUPPLIER_EMAIL_HINT,
  MISSING_SUPPLIER_EMAIL_HINT,
  draftForRows,
  draftForSupplier,
  draftsForSuppliers,
  matchSupplierRecipient,
  storedSupplierRecipient,
  supplierRecipientHint,
} from '@/components/features/orders/supplierMail';
import type { StockLevel } from '@/lib/domains/inventory/stock';

function row(supplier: string, name = 'Apples', productId?: string): StockLevel {
  return {
    productId: productId ?? `${supplier}-apple`,
    name,
    supplier,
    orderCases: 2,
    low: true,
  } as StockLevel;
}

test('purchase-order drafts use a stored recipient and never invent one', () => {
  assert.equal(storedSupplierRecipient('  buyer@farm.test '), 'buyer@farm.test');
  assert.equal(storedSupplierRecipient(null), '');
  assert.equal(storedSupplierRecipient(undefined), '');

  const blank = draftForRows('Farm & Sons', [row('Farm & Sons')], null);
  assert.equal(blank.to, '');
  assert.doesNotMatch(`${blank.to} ${blank.subject}`, /orders@/);

  const stored = draftForRows('Farm & Sons', [row('Farm & Sons')], 'buyer@farm.test');
  assert.equal(stored.to, 'buyer@farm.test');
});

test('bulk purchase orders create one draft per supplier without mixing lines', () => {
  const drafts = draftsForSuppliers(
    [
      {
        supplier: 'Farm & Sons',
        rows: [
          row('Farm & Sons', 'Bananas', 'farm-banana'),
          row('Dairy Co', 'Milk', 'dairy-milk'),
        ],
      },
      { supplier: 'Dairy Co', rows: [row('Dairy Co', 'Milk', 'dairy-milk')] },
    ],
    [
      { name: 'Farm & Sons', contactEmail: 'buyer@farm.test' },
      { name: 'Dairy Co', contactEmail: 'desk@dairy.test' },
    ]
  );

  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].supplier, 'Farm & Sons');
  assert.equal(drafts[0].to, 'buyer@farm.test');
  assert.equal(drafts[0].subject, 'Supermarket Purchase Order - Farm & Sons');
  assert.equal(drafts[0].body, '2 cases - Bananas');
  assert.deepEqual(drafts[0].productIds, ['farm-banana']);
  assert.equal(drafts[0].to.includes(','), false);
  assert.equal(drafts[0].to.includes('desk@dairy.test'), false);
  assert.equal(drafts[0].body.includes('Milk'), false);
  assert.equal(drafts[0].body.includes('desk@dairy.test'), false);

  assert.equal(drafts[1].supplier, 'Dairy Co');
  assert.equal(drafts[1].to, 'desk@dairy.test');
  assert.equal(drafts[1].body, '2 cases - Milk');
  assert.deepEqual(drafts[1].productIds, ['dairy-milk']);
  assert.equal(drafts[1].to.includes('buyer@farm.test'), false);
  assert.equal(drafts[1].body.includes('Bananas'), false);
  assert.equal(drafts[1].body.includes('buyer@farm.test'), false);
  assert.equal(
    drafts.some((draft) => draft.subject.includes('All suppliers')),
    false
  );
});

test('a supplier with no stored email keeps an empty To', () => {
  const drafts = draftsForSuppliers(
    [
      { supplier: 'Farm & Sons', rows: [row('Farm & Sons', 'Bananas', 'farm-banana')] },
      { supplier: 'Dairy Co', rows: [row('Dairy Co', 'Milk', 'dairy-milk')] },
    ],
    [
      { name: 'Farm & Sons', contactEmail: '   ' },
      { name: 'Dairy Co', contactEmail: 'desk@dairy.test' },
    ]
  );

  assert.equal(drafts[0].to, '');
  assert.equal(drafts[0].recipientIssue, 'missing');
  assert.equal(MISSING_SUPPLIER_EMAIL_HINT, 'No email saved for this supplier. Add it in Suppliers.');
  assert.equal(supplierRecipientHint(drafts[0]), MISSING_SUPPLIER_EMAIL_HINT);
  assert.equal(drafts[0].to.includes('desk@dairy.test'), false);
  assert.equal(drafts[0].body.includes('Milk'), false);
  assert.equal(drafts[0].body.includes('desk@dairy.test'), false);
  assert.equal(drafts[1].to, 'desk@dairy.test');
  assert.equal(supplierRecipientHint(drafts[1]), null);

  const unknown = draftForSupplier('Greens', [row('Greens', 'Kale', 'greens-kale')], [
    { name: 'Dairy Co', contactEmail: 'desk@dairy.test' },
  ]);
  assert.equal(unknown.to, '');
  assert.equal(unknown.recipientIssue, 'missing');
  assert.equal(unknown.body, '2 cases - Kale');
  assert.equal(unknown.to.includes('desk@dairy.test'), false);
  assert.equal(supplierRecipientHint(unknown), MISSING_SUPPLIER_EMAIL_HINT);
});

test('supplier names match trimmed and case-insensitive, and ambiguous names stay blank', () => {
  const matched = draftsForSuppliers(
    [{ supplier: '  dairy CO ', rows: [row('Dairy Co', 'Milk', 'dairy-milk')] }],
    [{ name: ' dairy co ', contactEmail: '  desk@dairy.test ' }]
  );
  assert.equal(matched.length, 1);
  assert.equal(matched[0].to, 'desk@dairy.test');
  assert.equal(matched[0].recipientIssue, undefined);
  assert.deepEqual(matched[0].productIds, ['dairy-milk']);
  assert.equal(supplierRecipientHint(matched[0]), null);

  const directory = [
    { name: ' dairy co ', contactEmail: 'desk@dairy.test' },
    { name: 'DAIRY CO', contactEmail: null },
    { name: 'Farm & Sons', contactEmail: 'buyer@farm.test' },
  ];
  assert.equal(matchSupplierRecipient('  Dairy Co ', directory).status, 'ambiguous');

  const ambiguous = draftsForSuppliers(
    [{ supplier: 'Dairy Co', rows: [row('Dairy Co', 'Milk', 'dairy-milk')] }],
    directory
  );
  assert.equal(ambiguous.length, 1);
  assert.equal(ambiguous[0].to, '');
  assert.equal(ambiguous[0].recipientIssue, 'ambiguous');
  assert.equal(supplierRecipientHint(ambiguous[0]), AMBIGUOUS_SUPPLIER_EMAIL_HINT);
  assert.equal(ambiguous[0].body, '2 cases - Milk');
  assert.equal(ambiguous[0].to.includes('desk@dairy.test'), false);
  assert.equal(ambiguous[0].to.includes('buyer@farm.test'), false);
  assert.equal(ambiguous[0].body.includes('@'), false);
  assert.doesNotMatch(AMBIGUOUS_SUPPLIER_EMAIL_HINT, /@/);
});

test('purchase order panel keeps drafts separate and does not send mail', () => {
  const panel = readFileSync('components/features/orders/PoEmailPanel.tsx', 'utf8');
  const buyList = readFileSync('components/features/orders/BuyList.tsx', 'utf8');
  const mail = readFileSync('components/features/orders/supplierMail.ts', 'utf8');

  assert.match(panel, /supplierRecipientHint/);
  assert.match(panel, /href="\/admin\/suppliers"/);
  assert.match(panel, /Prepare draft/);
  assert.equal(panel.includes('mailto:'), false);
  assert.equal(/resend/i.test(panel), false);
  assert.equal(/\bsent\b/i.test(panel), false);
  assert.equal(/\bkitchen\b/i.test(panel), false);

  assert.match(buyList, /draftsForSuppliers\(/);
  assert.match(buyList, /fetch\('\/api\/admin\/suppliers'/);
  assert.equal(buyList.includes('draftForAll'), false);
  assert.equal(buyList.includes('mailto:'), false);
  assert.equal(/resend/i.test(buyList), false);
  assert.match(buyList, /acknowledgePurchaseOrderDraft/);
  assert.match(buyList, /prepared\.markSent !== false/);

  assert.equal(mail.includes('draftForAll'), false);
  assert.equal(mail.includes('recipients.join'), false);
  assert.match(mail, /draftForRows/);
  assert.equal(/\bkitchen\b/i.test(mail), false);
});
