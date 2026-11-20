import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminInvoiceDetail } from '@/components/features/admin/AdminInvoiceDetail';
import { AdminInvoiceList } from '@/components/features/admin/AdminInvoiceList';
import { openAdminInvoiceDetail } from '@/app/admin/invoices/[id]/page';
import { setManagerStaffTestAuth } from '@/lib/auth/managerStaffTestAuth';
import { AuthError } from '@/lib/auth/session';
import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';
import {
  ADMIN_INVOICE_PAGE_SIZE,
  adminInvoiceDetailHref,
  buildAdminInvoiceListQuery,
  joinInvoiceLinesToDeliveries,
  type AdminInvoiceDeliveryRecord,
  type AdminInvoiceLineRecord,
  type AdminInvoiceListLookup,
} from '@/lib/domains/receiving/adminInvoiceQuery';
import {
  getAdminInvoiceDetail,
  listAdminInvoices,
  type AdminInvoiceReader,
} from '@/lib/domains/receiving/adminInvoiceRead';
import { canonicalInvoiceNumber, compactInvoiceNumber } from '@/lib/domains/receiving/invoiceDeliveryId';

const SUPPLIER = `c${'a'.repeat(24)}`;
const CURSOR = `c${'b'.repeat(24)}`;
const DOCUMENT = `c${'d'.repeat(24)}`;

function user(role: AuthSessionUser['role']): AuthSessionUser {
  return {
    id: `invoice-${role}`,
    name: 'Invoice tester',
    email: 'invoices@store.test',
    role,
    position: 'Staff',
    hourlyRate: null,
  };
}

function lookup(input: Parameters<typeof buildAdminInvoiceListQuery>[0]): AdminInvoiceListLookup {
  const query = buildAdminInvoiceListQuery(input);
  assert.equal(query.ok, true);
  if (!query.ok || query.skipQuery) throw new Error('expected an invoice lookup');
  return query.lookup;
}

function delivery(id: string, productName: string): AdminInvoiceDeliveryRecord {
  return {
    id,
    itemName: productName,
    productName,
    casesReceived: 2,
    caseCost: 4.5,
    packSize: 6,
    unitsAdded: 12,
    createdAt: new Date('2026-11-02T15:00:00.000Z'),
    transactionId: null,
  };
}

test('invoice number search uses the identity normalizer and the invoice key indexes', () => {
  const raw = '  INV   1001/A ';
  const invoiceKey = canonicalInvoiceNumber(raw);
  const invoiceKeyCompact = invoiceKey ? compactInvoiceNumber(invoiceKey) : null;
  assert.equal(invoiceKey, 'inv 1001/a');
  assert.equal(invoiceKeyCompact, 'inv1001/a');

  const query = buildAdminInvoiceListQuery({ invoiceNumber: raw, supplierId: SUPPLIER });
  assert.equal(query.ok, true);
  if (!query.ok || query.skipQuery) return;
  assert.deepEqual(query.normalized, { invoiceKey, invoiceKeyCompact });
  assert.deepEqual(query.lookup.where, {
    OR: [
      { supplierId: SUPPLIER, invoiceKey },
      { supplierId: SUPPLIER, invoiceKeyCompact },
      { supplierId: SUPPLIER, keyAliases: { some: { invoiceKey } } },
    ],
  });
  assert.equal(JSON.stringify(query.lookup.where).includes('contains'), false);
  assert.equal(JSON.stringify(query.lookup.where).includes('startsWith'), false);

  const spaced = lookup({ invoiceNumber: 'A 12', supplierId: SUPPLIER });
  const tight = lookup({ invoiceNumber: 'A12', supplierId: SUPPLIER });
  assert.deepEqual(spaced.where, {
    OR: [
      { supplierId: SUPPLIER, invoiceKey: 'a 12' },
      { supplierId: SUPPLIER, invoiceKeyCompact: 'a12' },
      { supplierId: SUPPLIER, keyAliases: { some: { invoiceKey: 'a 12' } } },
    ],
  });
  assert.notDeepEqual(spaced.where, tight.where);
  assert.equal(JSON.stringify(tight.where).includes('"invoiceKeyCompact":"a12"'), true);

  const anySupplier = lookup({ invoiceNumber: 'INV 1001' });
  assert.deepEqual(anySupplier.where, {
    OR: [
      { invoiceKey: 'inv 1001' },
      { invoiceKeyCompact: 'inv1001' },
      { keyAliases: { some: { invoiceKey: 'inv 1001' } } },
    ],
  });
});

test('supplier and invoice date filters are equality bounds, and bad input does not scan', () => {
  assert.deepEqual(lookup({ supplierId: SUPPLIER }).where, { supplierId: SUPPLIER });

  const ranged = lookup({
    supplierId: SUPPLIER,
    from: '2026-11-1',
    to: '2026/11/20',
    invoiceNumber: '1001',
  });
  assert.deepEqual(ranged.where, {
    AND: [
      {
        OR: [
          { supplierId: SUPPLIER, invoiceKey: '1001' },
          { supplierId: SUPPLIER, invoiceKeyCompact: '1001' },
          { supplierId: SUPPLIER, keyAliases: { some: { invoiceKey: '1001' } } },
        ],
      },
      {
        OR: [
          { invoiceDateKey: { gte: '2026-11-01', lte: '2026-11-20' } },
          { dateLinks: { some: { dateKey: { gte: '2026-11-01', lte: '2026-11-20' } } } },
        ],
      },
    ],
  });

  for (const invoiceNumber of ['n/a', 'NA', 'unread', 'unknown']) {
    const skipped = buildAdminInvoiceListQuery({ invoiceNumber, supplierId: SUPPLIER });
    assert.equal(skipped.ok, true);
    if (!skipped.ok) continue;
    assert.equal(skipped.skipQuery, true);
  }

  assert.equal(buildAdminInvoiceListQuery({ from: '01/02/2026' }).ok, false);
  assert.equal(buildAdminInvoiceListQuery({ to: '2026-02-31' }).ok, false);
  assert.equal(buildAdminInvoiceListQuery({ from: '2026-11-20', to: '2026-11-01' }).ok, false);
  assert.equal(buildAdminInvoiceListQuery({ supplierId: 'supplier-name' }).ok, false);
  assert.equal(buildAdminInvoiceListQuery({ cursor: '../secret' }).ok, false);
  assert.equal(buildAdminInvoiceListQuery({ invoiceNumber: 'x'.repeat(129) }).ok, false);
});

test('invoice list pages are capped and the cursor is the document id', () => {
  const first = lookup({});
  assert.equal(first.take, ADMIN_INVOICE_PAGE_SIZE + 1);
  assert.equal(first.cursor, undefined);
  assert.deepEqual(first.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);

  const next = lookup({ cursor: CURSOR, supplierId: SUPPLIER });
  assert.deepEqual(next.cursor, { id: CURSOR });
  assert.equal(next.skip, 1);
  assert.equal(next.take, ADMIN_INVOICE_PAGE_SIZE + 1);
  assert.deepEqual(next.where, { supplierId: SUPPLIER });
});

test('received lines join to deliveries on the shared line id', () => {
  const lines: AdminInvoiceLineRecord[] = [
    { id: 'line-b', printedKey: 'kale', occurrence: 0, ordinal: 2, heldByLegacy: false },
    { id: 'line-a', printedKey: 'milk', occurrence: 0, ordinal: 0, heldByLegacy: false },
    { id: 'line-c', printedKey: 'milk', occurrence: 1, ordinal: 1, heldByLegacy: true },
  ];
  const joined = joinInvoiceLinesToDeliveries(lines, [
    delivery('line-a', 'Whole milk'),
    delivery('line-z', 'Not on this invoice'),
  ]);

  assert.deepEqual(
    joined.map((row) => row.line.id),
    ['line-a', 'line-c', 'line-b']
  );
  assert.equal(joined[0]?.delivery?.id, 'line-a');
  assert.equal(joined[0]?.delivery?.productName, 'Whole milk');
  assert.equal(joined[1]?.delivery, null);
  assert.equal(joined[1]?.line.heldByLegacy, true);
  assert.equal(joined[2]?.delivery, null);
  assert.equal(
    joined.some((row) => row.delivery?.id === 'line-z'),
    false
  );
});

test('invoice reads reject roles that cannot open Admin', async (t) => {
  t.after(() => setManagerStaffTestAuth(null));

  for (const role of ['RECEIVING_CLERK', 'FLOOR_STAFF', 'DELI_CHEF'] as const) {
    setManagerStaffTestAuth(async () => user(role));
    const calls: string[] = [];
    const reader: AdminInvoiceReader = {
      findDocuments: async () => {
        calls.push('documents');
        return [];
      },
      findDocument: async () => {
        calls.push('document');
        return null;
      },
      findDeliveries: async () => {
        calls.push('deliveries');
        return [];
      },
    };

    await assert.rejects(
      () => listAdminInvoices({ invoiceNumber: '1001' }, reader),
      (error: unknown) => {
        assert.ok(error instanceof AuthError);
        assert.equal(error.status, 403);
        return true;
      }
    );
    await assert.rejects(
      () => getAdminInvoiceDetail(DOCUMENT, reader),
      (error: unknown) => {
        assert.ok(error instanceof AuthError);
        assert.equal(error.status, 403);
        return true;
      }
    );
    assert.deepEqual(calls, [], role);
  }
});

test('a store manager read uses the key lookup and joins deliveries by line id', async (t) => {
  t.after(() => setManagerStaffTestAuth(null));
  setManagerStaffTestAuth(async () => user('STORE_MANAGER'));

  const seen: AdminInvoiceListLookup[] = [];
  const list = await listAdminInvoices(
    { invoiceNumber: 'INV 1001', supplierId: SUPPLIER },
    {
      findDocuments: async (query) => {
        seen.push(query);
        return [
          {
            id: DOCUMENT,
            invoiceNumber: 'INV 1001',
            invoiceKey: 'inv 1001',
            invoiceDate: 'Nov 1, 2026',
            invoiceDateKey: '2026-11-01',
            supplierId: SUPPLIER,
            createdAt: new Date('2026-11-01T00:00:00.000Z'),
            supplier: { name: 'North Dairy' },
            _count: { lines: 2 },
          },
        ];
      },
      findDocument: async () => null,
      findDeliveries: async () => [],
    }
  );
  assert.equal(list.ok, true);
  if (!list.ok) return;
  assert.equal(list.invoices[0]?.supplierName, 'North Dairy');
  assert.equal(list.nextCursor, null);
  assert.equal(seen.length, 1);
  assert.equal(JSON.stringify(seen[0]?.where).includes('"invoiceKeyCompact":"inv1001"'), true);
  assert.equal(JSON.stringify(seen[0]?.where).includes(`"supplierId":"${SUPPLIER}"`), true);

  const deliveryIds: string[][] = [];
  const detail = await getAdminInvoiceDetail(DOCUMENT, {
    findDocuments: async () => [],
    findDocument: async (id) => {
      assert.equal(id, DOCUMENT);
      return {
        id: DOCUMENT,
        invoiceNumber: 'INV 1001',
        invoiceKey: 'inv 1001',
        invoiceDate: null,
        invoiceDateKey: '2026-11-01',
        supplierId: SUPPLIER,
        createdAt: new Date('2026-11-01T00:00:00.000Z'),
        supplier: { name: 'North Dairy' },
        lines: [
          { id: 'line-a', printedKey: 'milk', occurrence: 0, ordinal: 1, heldByLegacy: false },
          { id: 'line-b', printedKey: 'kale', occurrence: 0, ordinal: 0, heldByLegacy: false },
        ],
      };
    },
    findDeliveries: async (ids) => {
      deliveryIds.push(ids);
      return [delivery('line-b', 'Kale')];
    },
  });
  assert.equal(detail.ok, true);
  if (!detail.ok || !detail.invoice) return;
  assert.deepEqual(deliveryIds, [['line-a', 'line-b']]);
  assert.equal(detail.invoice.lines[0]?.line.id, 'line-b');
  assert.equal(detail.invoice.lines[0]?.delivery?.productName, 'Kale');
  assert.equal(detail.invoice.lines[1]?.delivery, null);

  setManagerStaffTestAuth(async () => user('ADMIN'));
  const unread = await listAdminInvoices({ invoiceNumber: 'n/a' }, {
    findDocuments: async () => {
      throw new Error('unreadable numbers must not query');
    },
    findDocument: async () => null,
    findDeliveries: async () => [],
  });
  assert.equal(unread.ok, true);
  if (unread.ok) assert.equal(unread.invoices.length, 0);
});

test('the invoice list renders supplier rows and a detail link', () => {
  const html = renderToStaticMarkup(
    createElement(AdminInvoiceList, {
      invoices: [
        {
          id: DOCUMENT,
          invoiceNumber: '1001/A',
          invoiceKey: '1001/a',
          invoiceDate: 'Nov 1, 2026',
          invoiceDateKey: '2026-11-01',
          supplierId: SUPPLIER,
          supplierName: 'North Dairy',
          createdAt: '2026-11-01T00:00:00.000Z',
          lineCount: 2,
        },
      ],
      suppliers: [{ id: SUPPLIER, name: 'North Dairy' }],
      filters: { invoiceNumber: '1001/A', supplierId: SUPPLIER, from: '2026-11-01', to: '2026-11-20' },
      nextCursor: CURSOR,
      notice: null,
      error: null,
      normalized: { invoiceKey: '1001/a', invoiceKeyCompact: '1001/a' },
    })
  );

  assert.match(html, /1001\/A/);
  assert.match(html, /North Dairy/);
  assert.match(html, /Nov 1, 2026/);
  assert.match(html, /2 lines/);
  assert.match(html, /Matched on invoice key/);
  const detailHref = adminInvoiceDetailHref(DOCUMENT, {
    invoiceNumber: '1001/A',
    supplierId: SUPPLIER,
    from: '2026-11-01',
    to: '2026-11-20',
  }).replace(/&/g, '&amp;');
  assert.equal(html.includes(`href="${detailHref}"`), true);
  assert.match(html, /method="get"/);
  assert.match(html, /action="\/admin\/invoices"/);
  assert.match(html, /Next invoices/);
  assert.equal(html.includes('manual'), false);
  assert.equal(/\bkitchen\b/i.test(html), false);

  const empty = renderToStaticMarkup(
    createElement(AdminInvoiceList, {
      invoices: [],
      suppliers: [],
      filters: {},
      nextCursor: null,
      notice: 'That text is not an invoice number. Unread, unknown, and n/a are not searched.',
      error: null,
      normalized: { invoiceKey: null, invoiceKeyCompact: null },
    })
  );
  assert.match(empty, /No invoices match this search/);
  assert.match(empty, /not an invoice number/);
  assert.equal(empty.includes('Next invoices'), false);

  const detail = renderToStaticMarkup(
    createElement(AdminInvoiceDetail, {
      invoice: {
        id: DOCUMENT,
        invoiceNumber: '1001/A',
        invoiceKey: '1001/a',
        invoiceDate: null,
        invoiceDateKey: '2026-11-01',
        supplierId: SUPPLIER,
        supplierName: 'North Dairy',
        createdAt: '2026-11-01T00:00:00.000Z',
        lines: joinInvoiceLinesToDeliveries(
          [
            { id: 'line-a', printedKey: 'milk', occurrence: 0, ordinal: 0, heldByLegacy: false },
            { id: 'line-b', printedKey: 'kale', occurrence: 0, ordinal: 1, heldByLegacy: false },
          ],
          [delivery('line-a', 'Whole milk')]
        ),
      },
      filters: { invoiceNumber: '1001/A' },
      error: null,
    })
  );
  assert.match(detail, /Whole milk/);
  assert.match(detail, /Not received/);
  assert.match(detail, /Back to invoices/);
  assert.match(detail, /href="\/admin\/invoices\?q=1001%2FA"/);
  assert.equal(detail.includes('not in the directory'), false);
});

test('a missing invoice triggers notFound', () => {
  assert.throws(
    () => openAdminInvoiceDetail({ ok: true, invoice: null }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as { digest?: string }).digest, 'NEXT_HTTP_ERROR_FALLBACK;404');
      return true;
    }
  );

  const invalid = openAdminInvoiceDetail({ ok: false, error: 'That invoice link is not valid.' });
  assert.equal(invalid.ok, false);
});

test('a receipt just after midnight UTC renders as the previous Toronto date', () => {
  const received = delivery('line-a', 'Whole milk');
  received.createdAt = new Date('2026-11-20T01:30:00.000Z');
  const html = renderToStaticMarkup(
    createElement(AdminInvoiceDetail, {
      invoice: {
        id: DOCUMENT,
        invoiceNumber: '1001/A',
        invoiceKey: '1001/a',
        invoiceDate: '2026-11-19',
        invoiceDateKey: '2026-11-19',
        supplierId: SUPPLIER,
        supplierName: 'North Dairy',
        createdAt: '2026-11-18T15:00:00.000Z',
        lines: joinInvoiceLinesToDeliveries(
          [{ id: 'line-a', printedKey: 'milk', occurrence: 0, ordinal: 0, heldByLegacy: false }],
          [received]
        ),
      },
      filters: {},
      error: null,
    })
  );
  const receivedAt = html.indexOf('Received Whole milk');
  const receiptDate = html.indexOf('Nov 19, 2026', receivedAt);
  assert.ok(receivedAt >= 0 && receiptDate > receivedAt);
  assert.equal(html.includes('Nov 20, 2026'), false);
  assert.match(html, /Saved Nov 18, 2026/);

  const list = readFileSync('components/features/admin/AdminInvoiceList.tsx', 'utf8');
  assert.equal(list.includes('timeZone'), false);
});

test('invoices stay off the phone bar and admin tabs, and reads do not write', () => {
  const tabs = readFileSync('components/features/admin/AdminViewTabs.tsx', 'utf8');
  const phone = readFileSync('lib/navigation/phoneNav.ts', 'utf8');
  const nav = readFileSync('lib/navigation/navItems.ts', 'utf8');
  const suppliers = readFileSync('app/admin/suppliers/page.tsx', 'utf8');
  const page = readFileSync('app/admin/invoices/page.tsx', 'utf8');
  const detailPage = readFileSync('app/admin/invoices/[id]/page.tsx', 'utf8');
  const read = readFileSync('lib/domains/receiving/adminInvoiceRead.ts', 'utf8');
  const listUi = readFileSync('components/features/admin/AdminInvoiceList.tsx', 'utf8');

  assert.equal(tabs.includes('/admin/invoices'), false);
  assert.equal(phone.includes('/admin/invoices'), false);
  assert.equal(nav.includes('/admin/invoices'), false);
  assert.match(suppliers, /href="\/admin\/invoices"/);
  assert.equal(/\bkitchen\b/i.test(page + detailPage + read + listUi), false);

  const listAt = read.indexOf('export async function listAdminInvoices');
  const detailAt = read.indexOf('export async function getAdminInvoiceDetail');
  assert.ok(listAt !== -1 && detailAt !== -1);
  assert.ok(read.indexOf('await requireManagerStaff()', listAt) < read.indexOf('findDocuments(', listAt));
  assert.ok(read.indexOf('await requireManagerStaff()', detailAt) < read.indexOf('findDocument(', detailAt));
  assert.equal(read.includes('.create('), false);
  assert.equal(read.includes('.update('), false);
  assert.equal(read.includes('.delete('), false);
  assert.equal(read.includes('.upsert('), false);
  assert.equal(listUi.includes('prisma'), false);
  assert.equal(listUi.includes('use client'), false);
  assert.ok(page.indexOf("guardFreshPage('/admin/invoices')") < page.indexOf('listAdminInvoices('));
  assert.ok(detailPage.indexOf("guardFreshPage('/admin/invoices')") < detailPage.indexOf('getAdminInvoiceDetail('));
});
