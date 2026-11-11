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
  OPENING_MAIL_APP,
  activateMailLink,
  purchaseOrderCompose,
  purchaseOrderCopiedMessage,
  purchaseOrderGroupBody,
  purchaseOrderGroupCompose,
  purchaseOrderGroupOpenedWarning,
  purchaseOrderLoggedFailureMessage,
  purchaseOrderOpeningMessage,
  purchaseOrderSkippedLabel,
  settlePurchaseOrderGroup,
  purchaseOrderLineKey,
  purchaseOrderMailto,
  purchaseOrderOpenedWarning,
  purchaseOrderSendAllConfirm,
  purchaseOrderSendPlan,
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

test('purchase order panel sends one supplier at a time and falls back to mail', () => {
  const panel = readFileSync('components/features/orders/PoEmailPanel.tsx', 'utf8');
  const buyList = readFileSync('components/features/orders/BuyList.tsx', 'utf8');
  const mail = readFileSync('components/features/orders/supplierMail.ts', 'utf8');

  assert.match(panel, /supplierRecipientHint/);
  assert.match(panel, /href="\/admin\/suppliers"/);
  assert.match(panel, /Prepare draft/);
  assert.match(panel, />\s*Send\s*</);
  assert.match(panel, /Send all/);
  assert.match(panel, /Send group/);
  assert.match(panel, /purchaseOrderSendPlan/);
  assert.match(panel, /purchaseOrderSendAllConfirm/);
  assert.match(panel, /purchaseOrderCompose/);
  assert.match(panel, /purchaseOrderGroupCompose\(plan\.ready\)/);
  assert.match(panel, /purchaseOrderOpenedWarning/);
  assert.match(panel, /purchaseOrderGroupOpenedWarning/);
  assert.match(panel, /purchaseOrderSkippedLabel/);
  assert.match(panel, /settlePurchaseOrderGroup/);
  assert.match(panel, /checkOnly/);
  assert.match(panel, /href=\{result\.mailtoUrl\}/);
  assert.match(panel, /target="_blank"/);
  assert.match(panel, /rel="noopener noreferrer"/);
  assert.match(panel, />\s*Open mail\s*</);
  assert.match(panel, /activateMailLink/);
  assert.match(panel, /purchaseOrderOpeningMessage/);
  assert.match(panel, /Copy full text/);
  assert.equal(panel.includes('result.truncated && result.fullBody'), false);
  assert.equal(panel.includes('window.location.href'), false);
  assert.equal(panel.includes('Mail opened'), false);
  assert.equal(mail.includes('openPurchaseOrderWindow'), false);
  assert.equal(mail.includes('settlePurchaseOrderWindow'), false);
  assert.equal(panel.includes('about:blank'), false);
  assert.equal(panel.includes('window.open'), false);
  assert.equal(panel.includes('Open in Gmail'), false);
  assert.equal(panel.includes('Email app'), false);
  assert.equal(panel.includes('mail.google.com'), false);
  assert.match(mail, /mail\.google\.com/);
  assert.equal(panel.includes('drafts.map((draft) => draft.to).join'), false);
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
  assert.match(mail, /Open a separate email for /);
  assert.equal(/\bkitchen\b/i.test(mail), false);
});

test('send all keeps each supplier separate and skips a blank address', () => {
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
  assert.equal(purchaseOrderSendAllConfirm(plan.ready.length), 'Open a separate email for 1 supplier?');
  assert.equal(purchaseOrderSendAllConfirm(2), 'Open a separate email for 2 suppliers?');

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
  assert.match(purchaseOrderOpenedWarning('2026-11-11T15:04:00.000Z'), /Already opened for this order on .+ open again\?/);
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

test('group mailto uses ready suppliers, checks repeats before any write, and names partial logs', async () => {
  const farm = draftForSupplier('Farm & Sons', [row('Farm & Sons', 'Bananas', 'farm-banana')], [
    { name: 'Farm & Sons', contactEmail: 'buyer@farm.test' },
  ]);
  const dairy = draftForSupplier('Dairy Co', [row('Dairy Co', 'Milk', 'dairy-milk')], [
    { name: 'Dairy Co', contactEmail: 'desk@dairy.test' },
  ]);
  const greens = draftForSupplier('Greens', [row('Greens', 'Kale', 'greens-kale')], []);
  const plan = purchaseOrderSendPlan([farm, dairy, greens]);
  const body = purchaseOrderGroupBody(plan.ready);
  assert.equal(body.includes('Bananas'), true);
  assert.equal(body.includes('Milk'), true);
  assert.equal(body.includes('Kale'), false);
  assert.equal(purchaseOrderSkippedLabel(plan.skipped.map((item) => item.supplier)), 'Skipped, no valid email: Greens');
  assert.equal(
    purchaseOrderGroupOpenedWarning(['Farm & Sons', 'Dairy Co']),
    'Already opened for Farm & Sons, Dairy Co, open again?'
  );

  const writes: string[] = [];
  const repeat = await settlePurchaseOrderGroup({
    items: plan.ready,
    name: (item) => item.supplier,
    confirmed: false,
    check: async (item) =>
      item.supplier === 'Dairy Co'
        ? { ok: false, status: 409, openedAt: '2026-11-11T16:00:00.000Z', message: 'Already opened for this order.' }
        : { ok: true },
    write: async (item) => {
      writes.push(item.supplier);
      return { ok: true };
    },
  });
  assert.equal(repeat.outcome, 'repeat');
  if (repeat.outcome === 'repeat') assert.deepEqual(repeat.suppliers, ['Dairy Co']);
  assert.deepEqual(writes, []);

  const calls: string[] = [];
  const opened = await settlePurchaseOrderGroup({
    items: plan.ready,
    name: (item) => item.supplier,
    confirmed: false,
    check: async (item) => {
      calls.push(`check:${item.supplier}`);
      return { ok: true };
    },
    write: async (item) => {
      calls.push(`write:${item.supplier}`);
      return { ok: true };
    },
  });
  assert.equal(opened.outcome, 'opened');
  assert.deepEqual(calls, ['check:Farm & Sons', 'check:Dairy Co', 'write:Farm & Sons', 'write:Dairy Co']);

  const partial = await settlePurchaseOrderGroup({
    items: [farm, dairy],
    name: (item) => item.supplier,
    confirmed: true,
    check: async () => {
      throw new Error('confirmed group must not pre-check');
    },
    write: async (item) => {
      if (item.supplier === 'Dairy Co') {
        return { ok: false, status: 500, message: 'The order could not be recorded.' };
      }
      return { ok: true };
    },
  });
  assert.equal(partial.outcome, 'failed');
  if (partial.outcome === 'failed') {
    assert.deepEqual(partial.logged, ['Farm & Sons']);
    assert.equal(partial.supplier, 'Dairy Co');
    assert.equal(
      purchaseOrderLoggedFailureMessage(partial.message, partial.logged),
      'The order could not be recorded. Logged: Farm & Sons.'
    );
  }

  const route = readFileSync('app/api/orders/purchase-order-email/route.ts', 'utf8');
  const checkAt = route.indexOf('input.checkOnly === true');
  const recordAt = route.indexOf('await recordPurchaseOrderOpen');
  assert.ok(checkAt !== -1 && recordAt !== -1 && checkAt < recordAt);
  assert.equal(route.includes('$transaction'), false);
});

test('a successful open keeps a mailto link and clicks it once', () => {
  assert.equal(OPENING_MAIL_APP, 'Opening your mail app…');
  assert.equal(purchaseOrderOpeningMessage(false), 'Opening your mail app…');
  assert.equal(
    purchaseOrderOpeningMessage(true),
    'Opening your mail app… The order text was shortened to fit.'
  );
  assert.equal(purchaseOrderCopiedMessage(true), 'Opening your mail app… Full text copied.');
  assert.equal(purchaseOrderCopiedMessage(false), 'Opening your mail app… The full text could not be copied.');

  let clicks = 0;
  const link = {
    click() {
      clicks += 1;
    },
  };
  activateMailLink(link);
  activateMailLink(null);
  assert.equal(clicks, 1);
});
