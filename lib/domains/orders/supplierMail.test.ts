import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  AMBIGUOUS_SUPPLIER_EMAIL_HINT,
  GMAIL_COMPOSE_URL_LIMIT,
  MAILTO_URL_LIMIT,
  MISSING_SUPPLIER_EMAIL_HINT,
  ORDER_TRUNCATED_NOTE,
  PURCHASE_ORDER_GROUP_SUBJECT,
  draftForRows,
  draftForSupplier,
  draftsForSuppliers,
  matchSupplierRecipient,
  applyPurchaseOrderLog,
  purchaseOrderCompose,
  purchaseOrderCopiedMessage,
  purchaseOrderGroupBody,
  purchaseOrderGroupCompose,
  purchaseOrderLineKey,
  purchaseOrderMailto,
  purchaseOrderOpenedWarning,
  purchaseOrderRepeatGate,
  purchaseOrderRepeatWarning,
  purchaseOrderSendPlan,
  purchaseOrderSkippedNoEmail,
  singleSupplierEmail,
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
  assert.equal(matched[0].supplierId, null);
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

test('purchase order panel opens mailto directly and logs in the background', () => {
  const panel = readFileSync('components/features/orders/PoEmailPanel.tsx', 'utf8');
  const buyList = readFileSync('components/features/orders/BuyList.tsx', 'utf8');
  const mail = readFileSync('components/features/orders/supplierMail.ts', 'utf8');

  assert.match(panel, /supplierRecipientHint/);
  assert.match(panel, /href="\/admin\/suppliers"/);
  assert.match(panel, />\s*Send\s*</);
  assert.match(panel, /Send group/);
  assert.match(panel, /purchaseOrderSendPlan/);
  assert.match(panel, /purchaseOrderCompose/);
  assert.match(panel, /purchaseOrderGroupCompose\(withLines\)/);
  assert.match(panel, /applyPurchaseOrderLog/);
  assert.match(panel, /purchaseOrderSkippedNoEmail\(skippedNoEmail\)/);
  assert.match(panel, /singleSupplierEmail\(item\.to\)/);
  assert.equal(panel.includes('keepalive'), false);
  assert.equal(panel.includes('onPrepare'), false);
  assert.match(
    panel,
    /<a\s+ref=\{anchorRef\}\s+href=\{href\}\s+target="_blank"\s+rel="noopener noreferrer"\s+className=\{className\}\s+onClick=\{onOpen\}\s*>/
  );
  assert.match(panel, /activeCompose\?\.truncated && sendHref \?/);
  assert.match(panel, /groupCompose\?\.truncated \?/);
  assert.match(panel, /Copy full text/);
  assert.equal(panel.includes('Prepare draft'), false);
  assert.equal(panel.includes('Send all'), false);
  assert.equal(panel.includes('Open mail'), false);
  assert.match(panel, />\s*Open again\s*</);
  assert.equal(panel.includes('Already opened'), false);
  assert.match(panel, /target="_blank"/);
  assert.match(panel, /rel="noopener noreferrer"/);
  assert.match(panel, /event\.preventDefault\(\)/);
  assert.match(panel, /checkOnly: true/);
  assert.match(panel, /reopen: true/);
  assert.equal(panel.includes('activateMailLink'), false);
  assert.equal(panel.includes('settlePurchaseOrderGroup'), false);
  assert.equal(panel.includes('window.location.href'), false);
  assert.equal(panel.includes('about:blank'), false);
  assert.equal(panel.includes('window.open'), false);
  assert.equal(panel.includes('Open in Gmail'), false);
  assert.equal(panel.includes('Email app'), false);
  assert.equal(panel.includes('mail.google.com'), false);
  assert.match(mail, /mail\.google\.com/);
  assert.match(mail, /timeZone: 'America\/Toronto'/);
  assert.equal(mail.includes("timeZone: 'UTC'"), false);
  assert.equal(mail.includes('activateMailLink'), false);
  assert.equal(mail.includes('settlePurchaseOrderGroup'), false);
  assert.equal(mail.includes('Open a separate email'), false);
  assert.match(mail, /Already opened at \$\{label\} \(Toronto\)\. Open again\?/);
  assert.equal(panel.includes('drafts.map((draft) => draft.to).join'), false);
  assert.equal(/resend/i.test(panel), false);
  assert.equal(/\bsent\b/i.test(panel), false);
  assert.equal(/\bkitchen\b/i.test(panel), false);

  assert.match(buyList, /draftsForSuppliers\(/);
  assert.match(buyList, /fetch\('\/api\/admin\/suppliers'/);
  assert.equal(buyList.includes('draftForAll'), false);
  assert.equal(buyList.includes('mailto:'), false);
  assert.equal(/resend/i.test(buyList), false);
  assert.equal(buyList.includes('onPrepare'), false);
  assert.equal(buyList.includes('acknowledgePurchaseOrderDraft'), false);

  assert.equal(mail.includes('draftForAll'), false);
  assert.equal(mail.includes('recipients.join'), false);
  assert.match(mail, /draftForRows/);
  assert.equal(/\bkitchen\b/i.test(mail), false);
});

test('a valid supplier email can be logged and a blank address cannot', () => {
  const farm = draftForSupplier('Farm & Sons', [row('Farm & Sons', 'Bananas', 'farm-banana')], [
    { id: 'sup-farm', name: 'Farm & Sons', contactEmail: 'buyer@farm.test' },
  ]);
  const greens = draftForSupplier('Greens', [row('Greens', 'Kale', 'greens-kale')], []);
  const listed = { ...farm, supplier: 'Listed Co', to: 'buyer@farm.test, other@farm.test' };
  assert.equal(farm.supplierId, 'sup-farm');
  const plan = purchaseOrderSendPlan([farm, greens, listed]);
  assert.deepEqual(plan.ready.map((draft) => draft.supplier), ['Farm & Sons']);
  assert.deepEqual(
    plan.skipped.map((draft) => draft.supplier),
    ['Greens', 'Listed Co']
  );
  assert.equal(plan.ready[0].to.includes('buyer@farm.test'), true);
  assert.equal(plan.ready[0].body.includes('Kale'), false);

  const mailto = purchaseOrderMailto(farm);
  assert.match(mailto ?? '', /^mailto:buyer@farm\.test\?/);
  assert.equal(purchaseOrderMailto(greens), null);
  assert.equal(purchaseOrderMailto({ ...farm, to: 'buyer@farm.test, other@farm.test' }), null);

  const key = purchaseOrderLineKey(farm);
  assert.equal(purchaseOrderLineKey({ ...farm, productIds: [...farm.productIds] }), key);
  assert.notEqual(purchaseOrderLineKey({ ...farm, body: `${farm.body}\nextra` }), key);
  assert.equal(key.includes('buyer@farm.test'), false);
});

test('Gmail compose encodes each part and shortens a long order', () => {
  const compose = purchaseOrderCompose({
    to: 'buyer@farm.test',
    subject: 'A & B',
    body: '2 cases\nBananas',
  });
  assert.ok(compose);
  assert.match(compose?.gmailUrl ?? '', /^https:\/\/mail\.google\.com\/mail\/\?view=cm&fs=1&to=/);
  assert.match(compose?.gmailUrl ?? '', /to=buyer%40farm\.test/);
  assert.match(compose?.gmailUrl ?? '', /su=A%20%26%20B/);
  assert.match(compose?.gmailUrl ?? '', /body=2%20cases%0ABananas/);
  const params = new URL(compose?.gmailUrl ?? 'https://mail.google.com/');
  assert.equal(params.searchParams.get('to'), 'buyer@farm.test');
  assert.equal(params.searchParams.get('su'), 'A & B');
  assert.equal(params.searchParams.get('body'), '2 cases\nBananas');
  assert.deepEqual([...params.searchParams.keys()], ['view', 'fs', 'to', 'su', 'body']);
  assert.equal(compose?.truncated, false);
  assert.equal(singleSupplierEmail('x?bcc=spy%40evil.com&z=@b.co'), null);
  assert.equal(singleSupplierEmail('buyer#note@farm.test'), null);
  assert.equal(purchaseOrderCompose({ to: 'x?bcc=spy%40evil.com&z=@b.co', subject: 'Hi', body: 'Order' }), null);
  assert.equal(purchaseOrderCompose({ to: 'buyer#note@farm.test', subject: 'Hi', body: 'Order' }), null);
  const injected = purchaseOrderCompose({
    to: 'buyer@farm.test',
    subject: 'Hi&bcc=spy@evil.com',
    body: 'line&x=1',
  });
  const injectedParams = new URL(injected?.gmailUrl ?? 'https://mail.google.com/').searchParams;
  assert.deepEqual([...injectedParams.keys()], ['view', 'fs', 'to', 'su', 'body']);
  assert.equal(injectedParams.get('to'), 'buyer@farm.test');
  assert.equal(injectedParams.get('su'), 'Hi&bcc=spy@evil.com');
  const mailtoParams = new URLSearchParams((injected?.mailtoUrl ?? '').split('?')[1]);
  assert.deepEqual([...mailtoParams.keys()], ['subject', 'body']);
  assert.match(injected?.mailtoUrl ?? '', /^mailto:buyer@farm\.test\?/);

  const long = purchaseOrderCompose({
    to: 'buyer@farm.test',
    subject: 'Order',
    body: 'x'.repeat(12000),
  });
  assert.ok(long);
  assert.equal(long?.truncated, true);
  assert.ok((long?.gmailUrl.length ?? 0) <= GMAIL_COMPOSE_URL_LIMIT);
  assert.ok((long?.mailtoUrl.length ?? 0) <= MAILTO_URL_LIMIT);
  assert.match(long?.body ?? '', /order truncated, see attached\/full list/);
  assert.equal(long?.body.endsWith(ORDER_TRUNCATED_NOTE), true);
  assert.equal(purchaseOrderOpenedWarning('2026-11-11T15:04:00.000Z'), 'Opened 10:04 AM');
  assert.equal(purchaseOrderOpenedWarning('2026-11-11T22:15:00.000Z'), 'Opened 5:15 PM');
  assert.equal(purchaseOrderOpenedWarning('2026-11-11T14:05:00.000Z'), 'Opened 9:05 AM');
  assert.equal(purchaseOrderOpenedWarning('not-a-date'), 'Opened not-a-date');
});

test('group mailto joins each supplier under a heading, caps the URL, and keeps extra headers out', () => {
  const farm = draftForSupplier('Farm & Sons', [row('Farm & Sons', 'Bananas', 'farm-banana')], [
    { name: 'Farm & Sons', contactEmail: 'buyer@farm.test' },
  ]);
  const dairy = draftForSupplier('Dairy Co', [row('Dairy Co', 'Milk', 'dairy-milk')], [
    { name: 'Dairy Co', contactEmail: 'desk@dairy.test' },
  ]);
  const body = purchaseOrderGroupBody([farm, dairy]);
  assert.equal(body, 'Farm & Sons\n2 cases - Bananas\n\nDairy Co\n2 cases - Milk');
  assert.equal(body.includes('buyer@farm.test'), false);
  assert.equal(body.includes('desk@dairy.test'), false);

  const opened = purchaseOrderGroupCompose([farm, dairy]);
  assert.ok(opened);
  assert.equal(opened?.to, '');
  assert.equal(opened?.truncated, false);
  assert.equal(opened?.subject, PURCHASE_ORDER_GROUP_SUBJECT);
  assert.match(opened?.mailtoUrl ?? '', /^mailto:\?subject=/);
  const openedParams = new URLSearchParams((opened?.mailtoUrl ?? '').split('?')[1]);
  assert.deepEqual([...openedParams.keys()], ['subject', 'body']);
  assert.equal(openedParams.get('body'), body);
  assert.equal(openedParams.get('to'), null);
  assert.equal(openedParams.get('bcc'), null);

  const injected = purchaseOrderGroupCompose([
    { supplier: 'Farm\r\nBcc: spy@evil.com', body: 'line&bcc=spy@evil.com' },
    { supplier: 'Dairy?to=spy@evil.com', body: '2 cases - Milk' },
  ]);
  assert.ok(injected);
  assert.match(injected?.mailtoUrl ?? '', /^mailto:\?subject=/);
  const injectedParams = new URLSearchParams((injected?.mailtoUrl ?? '').split('?')[1]);
  assert.deepEqual([...injectedParams.keys()], ['subject', 'body']);
  assert.equal(injectedParams.get('bcc'), null);
  assert.equal(injectedParams.get('to'), null);
  assert.match(injectedParams.get('body') ?? '', /Farm Bcc: spy@evil.com/);
  assert.match(injectedParams.get('body') ?? '', /Dairy\?to=spy@evil.com/);
  assert.equal((injected?.mailtoUrl ?? '').includes('&bcc='), false);
  assert.equal((injected?.mailtoUrl ?? '').includes('?bcc='), false);
  assert.equal(singleSupplierEmail('x?bcc=spy%40evil.com&z=@b.co'), null);

  const long = purchaseOrderGroupCompose([
    { supplier: 'Farm & Sons', body: 'x'.repeat(4000) },
    { supplier: 'Dairy Co', body: 'y'.repeat(4000) },
  ]);
  assert.ok(long);
  assert.equal(long?.truncated, true);
  assert.ok((long?.mailtoUrl.length ?? 0) <= MAILTO_URL_LIMIT);
  assert.match(long?.body ?? '', /order truncated, see attached\/full list/);
  assert.equal(long?.body.endsWith(ORDER_TRUNCATED_NOTE), true);
  assert.match(long?.fullBody ?? '', /Farm & Sons/);
  assert.match(long?.fullBody ?? '', /Dairy Co/);
  assert.match(long?.fullBody ?? '', /y{10}/);
  assert.ok((long?.fullBody.length ?? 0) > (long?.body.length ?? 0));
});

test('group body includes suppliers without an email; the open log still requires one', () => {
  const farm = draftForSupplier('Farm & Sons', [row('Farm & Sons', 'Bananas', 'farm-banana')], [
    { name: 'Farm & Sons', contactEmail: 'buyer@farm.test' },
  ]);
  const dairy = draftForSupplier('Dairy Co', [row('Dairy Co', 'Milk', 'dairy-milk')], [
    { name: 'Dairy Co', contactEmail: 'desk@dairy.test' },
  ]);
  const greens = draftForSupplier('Greens', [row('Greens', 'Kale', 'greens-kale')], []);
  const withLines = [farm, dairy, greens].filter(
    (item) => item.productIds.length > 0 || item.body.trim().length > 0
  );
  const body = purchaseOrderGroupBody(withLines);
  assert.equal(body.includes('Bananas'), true);
  assert.equal(body.includes('Milk'), true);
  assert.equal(body.includes('Kale'), true);
  assert.equal(body.includes('buyer@farm.test'), false);
  const plan = purchaseOrderSendPlan(withLines);
  assert.deepEqual(
    plan.ready.map((item) => item.supplier),
    ['Farm & Sons', 'Dairy Co']
  );
  assert.deepEqual(
    plan.skipped.map((item) => item.supplier),
    ['Greens']
  );
  const opened = purchaseOrderGroupCompose(withLines);
  assert.match(opened?.mailtoUrl ?? '', /^mailto:\?subject=/);
  assert.equal(new URLSearchParams((opened?.mailtoUrl ?? '').split('?')[1]).get('bcc'), null);
  assert.match(opened?.fullBody ?? '', /Greens\n2 cases - Kale/);

  const route = readFileSync('app/api/orders/purchase-order-email/route.ts', 'utf8');
  assert.match(route, /singleSupplierEmail\(input\.to\)/);
  assert.match(route, /Enter one supplier email address\./);
  const checkAt = route.indexOf('input.checkOnly === true');
  const recordAt = route.indexOf('await recordPurchaseOrderOpen');
  assert.ok(checkAt !== -1 && recordAt !== -1 && checkAt < recordAt);
  assert.equal(route.includes('$transaction'), false);
});

test('a failed open log appears in the issues list and names the supplier', () => {
  const network = applyPurchaseOrderLog(
    { notes: [], issues: [] },
    { supplier: 'Greens', grouped: false, result: { network: true } }
  );
  assert.deepEqual(network.notes, []);
  assert.deepEqual(network.issues, ['Greens: The order could not be recorded.']);

  const denied = applyPurchaseOrderLog(
    { notes: [], issues: [] },
    {
      supplier: 'Farm & Sons',
      grouped: true,
      result: { status: 400, error: 'A saved supplier is required before opening.' },
    }
  );
  assert.deepEqual(denied.notes, []);
  assert.deepEqual(denied.issues, ['Farm & Sons: A saved supplier is required before opening.']);

  const repeat = applyPurchaseOrderLog(
    { notes: [], issues: ['Greens: The order could not be recorded.'] },
    { supplier: 'Farm & Sons', grouped: false, result: { status: 409, openedAt: '2026-11-11T15:04:00.000Z' } }
  );
  assert.deepEqual(repeat.issues, ['Greens: The order could not be recorded.']);
  assert.deepEqual(repeat.notes, ['Opened 10:04 AM']);

  const opened = applyPurchaseOrderLog(
    { notes: [], issues: [] },
    { supplier: 'Dairy Co', grouped: true, result: { status: 200, openedAt: '2026-11-11T22:15:00.000Z' } }
  );
  assert.deepEqual(opened.issues, []);
  assert.deepEqual(opened.notes, ['Dairy Co: Opened 5:15 PM']);

  assert.equal(purchaseOrderSkippedNoEmail([]), null);
  assert.equal(purchaseOrderSkippedNoEmail(['Greens', 'Bakery']), 'Skipped, no email: Greens, Bakery');

  const panel = readFileSync('components/features/orders/PoEmailPanel.tsx', 'utf8');
  assert.match(panel, /setIssues\(\(current\) => \[\.\.\.current, \.\.\.next\.issues\]\)/);
  assert.match(panel, /\.catch\(\(\) => \{\s*showLog\(item, grouped, \{ network: true \}, generation\);\s*\}\)/);
  assert.equal(panel.includes('keepalive'), false);
});

test('mailto anchors open in a new tab and a repeat waits for confirm', () => {
  assert.equal(
    purchaseOrderRepeatWarning('2026-11-11T15:04:00.000Z'),
    'Already opened at 10:04 AM (Toronto). Open again?'
  );
  assert.equal(
    purchaseOrderRepeatWarning('2026-11-11T22:15:00.000Z'),
    'Already opened at 5:15 PM (Toronto). Open again?'
  );
  assert.equal(purchaseOrderRepeatWarning('not-a-date'), 'Already opened at not-a-date (Toronto). Open again?');
  assert.equal(purchaseOrderRepeatGate(409), 'confirm');
  assert.equal(purchaseOrderRepeatGate(200), 'open');
  assert.equal(purchaseOrderRepeatGate(400), 'issue');

  const panel = readFileSync('components/features/orders/PoEmailPanel.tsx', 'utf8');
  const anchors = panel.match(/target="_blank"/g) ?? [];
  assert.equal(anchors.length, 1);
  assert.match(panel, /rel="noopener noreferrer"/);
  assert.match(panel, /holdClick\(event, \[draft\], false, sendAnchor\.current, null\)/);
  assert.match(panel, /holdClick\(\s*event,\s*loggable,\s*true,\s*groupAnchor\.current,/);
  assert.match(panel, /if \(gate === 'confirm'\)/);
  assert.match(panel, /if \(repeats\.length > 0\)/);
  assert.match(panel, /logOpened\(item, grouped, false\)/);
  assert.match(panel, /logOpened\(item, pending\.grouped, true\)/);
  assert.match(panel, /reopen \? \{ reopen: true \} : \{\}/);
  assert.equal(panel.includes('keepalive'), false);
});

test('copy confirms the full order text', () => {
  assert.equal(purchaseOrderCopiedMessage(true), 'Full text copied.');
  assert.equal(purchaseOrderCopiedMessage(false), 'The full text could not be copied.');
});
