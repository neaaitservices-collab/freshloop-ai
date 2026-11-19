import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { applyOcrDraftResolutions, buildAuthoritativeOcrDraft, draftPostingBlockers } from '@/lib/domains/receiving/invoiceOcrDraft';
import { invoiceMatchResolutions } from '@/lib/domains/receiving/invoiceMatchChoice';
import {
  applySupplierMatchWrites,
  loadActiveSupplierProductLinks,
  matchInvoiceLine,
  normalizeLineNameKey,
  normalizeSupplierCode,
  planSupplierMatchWrites,
  printedMatchValue,
  reapplySupplierLinks,
  type SupplierProductLinkRef,
} from '@/lib/domains/receiving/supplierProductMatch';
import type { OcrDraftLine } from '@/lib/domains/receiving/invoiceOcrCommit';

const tomatoes: SupplierProductLinkRef = {
  matchType: 'name',
  matchKey: 'hot house tomatoes on',
  printedValue: 'Hot House Tomatoes, ON',
  productId: 'tomatoes',
  productName: 'Hot House Tomatoes',
};
const coded: SupplierProductLinkRef = {
  matchType: 'code',
  matchKey: 'AB12',
  printedValue: 'ab-12',
  productId: 'apples',
  productName: 'Honeycrisp Apples',
};
const catalog = [
  { id: 'apples', name: 'Honeycrisp Apples' },
  { id: 'tomatoes', name: 'Hot House Tomatoes' },
  { id: 'lemons', name: 'Lemons' },
];

function draftLine(overrides: Partial<OcrDraftLine> = {}): OcrDraftLine {
  return {
    product_id: '',
    quantity: 1,
    unit_cost: 4,
    line_name: 'Hot House Tomatoes, ON',
    printed_name: 'Hot House Tomatoes, ON',
    line_confidence: 0.9,
    requires_approval: false,
    ...overrides,
  };
}

test('supplier codes fold spaces, dashes, and dots and reject blanks', () => {
  assert.equal(normalizeSupplierCode(' ab-12 '), 'AB12');
  assert.equal(normalizeSupplierCode('ab.12'), 'AB12');
  assert.equal(normalizeSupplierCode('  '), null);
  assert.equal(normalizeSupplierCode(''), null);
  assert.equal(normalizeSupplierCode(null), null);
  assert.equal(normalizeSupplierCode('A'.repeat(33)), null);
  assert.equal(printedMatchValue('  '), null);
  assert.equal(printedMatchValue(' ab-12 '), 'ab-12');
});

test('learned names strip punctuation and collapse spaces', () => {
  assert.equal(normalizeLineNameKey('Hot House Tomatoes, ON'), 'hot house tomatoes on');
  assert.equal(normalizeLineNameKey('HOT HOUSE TOMATOES ON'), 'hot house tomatoes on');
  assert.equal(normalizeLineNameKey('  tomatoes...  '), 'tomatoes');
  assert.equal(normalizeLineNameKey(' , '), null);
  assert.equal(normalizeLineNameKey(''), null);
});

test('match order is code, then learned name, then fuzzy', () => {
  const links = [tomatoes, coded];
  const byCode = matchInvoiceLine({
    code: ' ab-12 ',
    name: 'HOT HOUSE TOMATOES ON',
    links,
    catalog,
  });
  assert.equal(byCode.source, 'code');
  assert.equal(byCode.product?.id, 'apples');
  assert.equal(byCode.score, 100);
  assert.equal(byCode.printedValue, 'ab-12');

  const byName = matchInvoiceLine({
    code: ' ',
    name: 'HOT HOUSE TOMATOES ON',
    links,
    catalog,
  });
  assert.equal(byName.source, 'learned_name');
  assert.equal(byName.product?.id, 'tomatoes');

  const fuzzy = matchInvoiceLine({
    code: null,
    name: 'Lemons',
    links,
    catalog,
  });
  assert.equal(fuzzy.source, 'name');
  assert.equal(fuzzy.product?.id, 'lemons');

  const otherSupplier = matchInvoiceLine({
    name: 'HOT HOUSE TOMATOES ON',
    links: [],
    catalog,
  });
  assert.notEqual(otherSupplier.source, 'learned_name');
  assert.notEqual(otherSupplier.source, 'code');
});

test('a link to a product outside the active catalog is ignored', () => {
  const inactive: SupplierProductLinkRef = {
    matchType: 'code',
    matchKey: 'AB12',
    printedValue: 'AB12',
    productId: 'retired',
    productName: 'Retired Apples',
  };
  const hit = matchInvoiceLine({
    code: 'AB12',
    name: 'HOT HOUSE TOMATOES ON',
    links: [inactive, tomatoes],
    catalog,
  });
  assert.equal(hit.source, 'learned_name');
  assert.equal(hit.product?.id, 'tomatoes');
});

test('remember writes one code row, or a name row when there is no code', () => {
  const codeLine = draftLine({
    supplier_code: ' ab-12 ',
    product_id: 'apples',
    remember: true,
    line_name: 'Renamed apples',
    printed_name: 'Honeycrisp',
  });
  assert.deepEqual(planSupplierMatchWrites([codeLine], 'deodato'), [
    { action: 'upsert', matchType: 'code', matchKey: 'AB12', printedValue: 'ab-12', productId: 'apples' },
  ]);

  const nameLine = draftLine({ product_id: 'tomatoes', remember: true });
  assert.deepEqual(planSupplierMatchWrites([nameLine], 'deodato'), [
    {
      action: 'upsert',
      matchType: 'name',
      matchKey: 'hot house tomatoes on',
      printedValue: 'Hot House Tomatoes, ON',
      productId: 'tomatoes',
    },
  ]);

  assert.deepEqual(planSupplierMatchWrites([{ ...nameLine, remember: false }], 'deodato'), []);
  assert.deepEqual(planSupplierMatchWrites([nameLine], ''), []);
  assert.deepEqual(planSupplierMatchWrites([nameLine], null), []);
  assert.deepEqual(
    planSupplierMatchWrites([{ ...codeLine, supplier_code: '   ', printed_name: '   ', line_name: '   ' }], 'deodato'),
    []
  );
  assert.deepEqual(
    planSupplierMatchWrites([{ ...nameLine, create_new: true, product_id: '' }], 'deodato'),
    []
  );
});

test('unlink deletes the link that matched, for a code or a saved name', () => {
  assert.deepEqual(
    planSupplierMatchWrites(
      [draftLine({ supplier_code: 'AB-12', unlink_match: true, match_source: 'code', product_id: 'apples' })],
      'deodato'
    ),
    [{ action: 'delete', matchType: 'code', matchKey: 'AB12', printedValue: 'AB-12' }]
  );
  assert.deepEqual(
    planSupplierMatchWrites(
      [
        draftLine({
          supplier_code: 'ZZ',
          unlink_match: true,
          match_source: 'learned_name',
          product_id: 'tomatoes',
        }),
      ],
      'deodato'
    ),
    [{ action: 'delete', matchType: 'name', matchKey: 'hot house tomatoes on', printedValue: 'Hot House Tomatoes, ON' }]
  );
});

test('commit keeps a clerk pick and replaces an automatic link for the chosen supplier', () => {
  const picked = reapplySupplierLinks(
    [draftLine({ product_id: 'lemons', product_picked: true, supplier_code: 'AB-12' })],
    [coded],
    catalog
  );
  assert.equal(picked[0]?.product_id, 'lemons');

  const relinked = reapplySupplierLinks(
    [draftLine({ product_id: 'lemons', match_source: 'name', supplier_code: ' ab-12 ' })],
    [coded],
    catalog
  );
  assert.equal(relinked[0]?.product_id, 'apples');
  assert.equal(relinked[0]?.match_source, 'code');

  const unlinked = reapplySupplierLinks(
    [draftLine({ product_id: 'apples', supplier_code: 'AB-12', match_source: 'code', unlink_match: true, line_name: 'Lemons' })],
    [coded],
    catalog
  );
  assert.equal(unlinked[0]?.product_id, 'lemons');
  assert.equal(unlinked[0]?.match_source, 'name');

  const created = reapplySupplierLinks([draftLine({ product_id: 'apples', create_new: true })], [coded], catalog);
  assert.equal(created[0]?.product_id, '');
  assert.equal(created[0]?.remember, false);
});

test('a clerk pick is stored on the draft and a rename keeps the printed name', () => {
  const draft = buildAuthoritativeOcrDraft({
    vendorName: 'Deodato',
    invoiceNumber: '1',
    invoiceDate: '2026-11-01',
    totalAmount: 4,
    departmentBreakdown: { PRODUCE: 4 },
    lines: [
      {
        item_name: 'Hot House Tomatoes, ON',
        supplier_code: ' ab-12 ',
        printed_name: 'Hot House Tomatoes, ON',
        product_id: null,
        quantity: 1,
        unit: 'cases',
        unit_cost: 4,
        department: 'PRODUCE',
        case_pack_size: 1,
        line_confidence: 0.5,
        requires_approval: false,
        match_source: null,
      },
    ],
  });
  assert.equal(draft.lines[0]?.supplier_code, 'ab-12');
  assert.equal(draft.lines[0]?.printed_name, 'Hot House Tomatoes, ON');
  const blankCode = buildAuthoritativeOcrDraft({
    vendorName: 'Deodato',
    invoiceNumber: '1',
    invoiceDate: '2026-11-01',
    totalAmount: 0,
    departmentBreakdown: {},
    lines: [
      {
        item_name: '...',
        supplier_code: ' - . ',
        product_id: 'apples',
        quantity: 1,
        unit: 'cases',
        unit_cost: 1,
        department: 'PRODUCE',
        case_pack_size: 1,
        line_confidence: 0.99,
        requires_approval: false,
      },
    ],
  });
  assert.equal(blankCode.lines[0]?.supplier_code, undefined);
  assert.equal(blankCode.lines[0]?.printed_name, undefined);
  const picked = applyOcrDraftResolutions(
    draft,
    { lines: [{ index: 0, line_name: 'Renamed tomatoes', product_id: 'tomatoes', remember: true }] },
    { actorIsManager: false, manualReviewOverride: false }
  );
  assert.equal(picked.lines[0]?.line_name, 'Renamed tomatoes');
  assert.equal(picked.lines[0]?.printed_name, 'Hot House Tomatoes, ON');
  assert.equal(picked.lines[0]?.product_id, 'tomatoes');
  assert.equal(picked.lines[0]?.product_picked, true);
  assert.equal(picked.lines[0]?.remember, true);

  const blank = applyOcrDraftResolutions(draft, { lines: [{ index: 0, product_id: '   ' }] });
  assert.equal(blank.lines[0]?.product_picked, undefined);

  const creating = applyOcrDraftResolutions(picked, { lines: [{ index: 0, create_new: true }] });
  assert.equal(creating.lines[0]?.create_new, true);
  assert.equal(creating.lines[0]?.product_id, '');
  assert.equal(draftPostingBlockers(creating, { actorIsManager: false, manualReviewOverride: false }).some((row) => /not matched/.test(row)), false);
  assert.equal(
    draftPostingBlockers(draft, { actorIsManager: true, manualReviewOverride: true }).some((row) => /not matched/.test(row)),
    false
  );
});

test('receive resolutions carry a pick, remember, unlink, and create', () => {
  const lines = invoiceMatchResolutions(
    [{ id: 'line-1', draftLineIndex: 3 }],
    { 'line-1': { productPicked: true, productId: 'tomatoes', remember: true } },
    true
  );
  assert.deepEqual(lines, { lines: [{ index: 3, product_id: 'tomatoes', remember: true }] });
  assert.equal(
    invoiceMatchResolutions(
      [{ id: 'line-1', draftLineIndex: 3 }],
      { 'line-1': { productPicked: true, productId: 'tomatoes', remember: true } },
      false
    )?.lines[0]?.remember,
    false
  );
  assert.deepEqual(
    invoiceMatchResolutions([{ id: 'line-1', draftLineIndex: 0 }], { 'line-1': { unlink: true } }, true),
    { lines: [{ index: 0, unlink: true }] }
  );
  assert.deepEqual(
    invoiceMatchResolutions([{ id: 'line-1', draftLineIndex: 0 }], { 'line-1': { createNew: true } }, true),
    { lines: [{ index: 0, create_new: true }] }
  );
});

test('the supplier match migration checks the key and grants nothing to the Data API roles', () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'prisma/migrations/20261119050000_supplier_product_matches/migration.sql'),
    'utf8'
  );
  assert.match(sql, /^BEGIN;$/m);
  assert.match(sql, /^COMMIT;$/m);
  assert.match(sql, /SET LOCAL lock_timeout = '5s';/);
  assert.equal(sql.includes("SET lock_timeout = '5s';"), false);
  assert.match(sql, /CHECK \("match_type" IN \('code', 'name'\)\)/);
  assert.match(sql, /CHECK \("match_key" <> ''\)/);
  assert.match(sql, /CHECK \(btrim\("printed_value"\) <> ''\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.supplier_product_matches FROM %I/);
  assert.equal(sql.includes('GRANT '), false);
  assert.equal(sql.includes('anon'), true);
  assert.equal(sql.includes('authenticated'), true);
});

function uniqueViolation(): Error {
  const error = new Error('Unique constraint failed');
  (error as { code?: string }).code = 'P2002';
  return error;
}

test('a link write outside a transaction does not open a savepoint', async () => {
  const sql: string[] = [];
  await applySupplierMatchWrites(
    {
      $transaction: async () => undefined,
      $executeRawUnsafe: async (query: string) => {
        sql.push(query);
      },
      supplierProductMatch: {
        upsert: async () => ({ id: 'row' }),
        update: async () => {
          throw new Error('update should not run');
        },
        deleteMany: async () => ({ count: 0 }),
      },
    } as never,
    'deodato',
    'clerk',
    [{ action: 'upsert', matchType: 'code', matchKey: 'AB12', printedValue: 'AB12', productId: 'apples' }]
  );
  assert.deepEqual(sql, []);
});

test('a concurrent link upsert inside a transaction rolls back to its savepoint', async () => {
  const sql: string[] = [];
  await applySupplierMatchWrites(
    {
      $executeRawUnsafe: async (query: string) => {
        sql.push(query);
      },
      supplierProductMatch: {
        upsert: async () => {
          throw uniqueViolation();
        },
        update: async () => ({ id: 'row' }),
        deleteMany: async () => ({ count: 0 }),
      },
    } as never,
    'deodato',
    'clerk',
    [{ action: 'upsert', matchType: 'code', matchKey: 'AB12', printedValue: 'AB12', productId: 'apples' }]
  );
  assert.match(sql[0] ?? '', /^SAVEPOINT spm_link_/);
  assert.match(sql[1] ?? '', /^ROLLBACK TO SAVEPOINT spm_link_/);
});

test('a concurrent link upsert is saved as an update instead of failing the post', async () => {
  const updates: Array<{
    where: { supplierId_matchType_matchKey: { matchKey: string } };
    data: { productId: string; printedValue: string };
  }> = [];
  let upserts = 0;
  const db = {
    supplierProductMatch: {
      upsert: async () => {
        upserts += 1;
        throw uniqueViolation();
      },
      update: async (args: {
        where: { supplierId_matchType_matchKey: { matchKey: string } };
        data: { productId: string; printedValue: string };
      }) => {
        updates.push(args);
        return { id: 'row' };
      },
      deleteMany: async () => ({ count: 0 }),
    },
  };
  await applySupplierMatchWrites(db as never, 'deodato', 'clerk', [
    { action: 'upsert', matchType: 'code', matchKey: 'AB12', printedValue: ' ab-12 ', productId: 'apples' },
  ]);
  assert.equal(upserts, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.where.supplierId_matchType_matchKey.matchKey, 'AB12');
  assert.equal(updates[0]?.data.productId, 'apples');
  assert.equal(updates[0]?.data.printedValue, 'ab-12');

  await assert.rejects(
    () =>
      applySupplierMatchWrites(
        {
          supplierProductMatch: {
            upsert: async () => {
              throw uniqueViolation();
            },
            update: async () => {
              throw new Error('still conflicting');
            },
            deleteMany: async () => ({ count: 0 }),
          },
        } as never,
        'deodato',
        'clerk',
        [{ action: 'upsert', matchType: 'code', matchKey: 'AB12', printedValue: 'AB12', productId: 'apples' }]
      ),
    /still conflicting/
  );

  const other = new Error('connection lost');
  await assert.rejects(
    () =>
      applySupplierMatchWrites(
        {
          supplierProductMatch: {
            upsert: async () => {
              throw other;
            },
            update: async () => {
              throw new Error('update should not run');
            },
            deleteMany: async () => ({ count: 0 }),
          },
        } as never,
        'deodato',
        'clerk',
        [{ action: 'upsert', matchType: 'code', matchKey: 'AB12', printedValue: 'AB12', productId: 'apples' }]
      ),
    /connection lost/
  );
});

function missingTable(code = 'P2021', message = 'The table `public.supplier_product_matches` does not exist in the current database.'): Error {
  const error = new Error(message);
  (error as { code?: string }).code = code;
  return error;
}

test('scan and commit treat a missing supplier match table as no links', async () => {
  const warnings: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  try {
    const links = await loadActiveSupplierProductLinks('deodato', {
      supplierProductMatch: { findMany: async () => { throw missingTable(); } },
    } as never);
    assert.deepEqual(links, []);
    const byMessage = await loadActiveSupplierProductLinks('deodato', {
      supplierProductMatch: {
        findMany: async () => {
          throw missingTable('42P01', 'relation "supplier_product_matches" does not exist');
        },
      },
    } as never);
    assert.deepEqual(byMessage, []);
    await assert.rejects(
      () =>
        loadActiveSupplierProductLinks('deodato', {
          supplierProductMatch: { findMany: async () => { throw new Error('connection lost'); } },
        } as never),
      /connection lost/
    );
  } finally {
    console.warn = original;
  }
  assert.equal(warnings.length, 2);
  assert.match(String(warnings[0]?.[0]), /supplier_product_matches is not in this database yet/);
});

test('a P2021 that names another table is re-thrown', async () => {
  const other = Object.assign(new Error('The table `public.products` does not exist in the current database.'), {
    code: 'P2021',
    meta: { table: 'public.products', modelName: 'Product' },
  });
  await assert.rejects(
    () =>
      loadActiveSupplierProductLinks('deodato', {
        supplierProductMatch: {
          findMany: async () => {
            throw other;
          },
        },
      } as never),
    (error: unknown) => error === other
  );
  const unnamed = Object.assign(new Error('The table does not exist in the current database.'), { code: 'P2021' });
  await assert.rejects(
    () =>
      loadActiveSupplierProductLinks('deodato', {
        supplierProductMatch: {
          findMany: async () => {
            throw unnamed;
          },
        },
      } as never),
    (error: unknown) => error === unnamed
  );
});

test('remember and unlink skip a missing table without aborting the stock transaction', async () => {
  const sql: string[] = [];
  let updates = 0;
  const warnings: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  try {
    await applySupplierMatchWrites(
      {
        $executeRawUnsafe: async (query: string) => {
          sql.push(query);
        },
        supplierProductMatch: {
          upsert: async () => {
            throw missingTable();
          },
          deleteMany: async () => {
            throw missingTable();
          },
          update: async () => {
            updates += 1;
            return { id: 'row' };
          },
        },
      } as never,
      'deodato',
      'clerk',
      [
        { action: 'upsert', matchType: 'code', matchKey: 'AB12', printedValue: 'AB12', productId: 'apples' },
        { action: 'delete', matchType: 'name', matchKey: 'hot house tomatoes on', printedValue: 'Tomatoes' },
      ]
    );
  } finally {
    console.warn = original;
  }
  assert.equal(updates, 0);
  assert.equal(warnings.length, 1);
  assert.match(sql[0] ?? '', /^SAVEPOINT spm_link_/);
  assert.match(sql[1] ?? '', /^ROLLBACK TO SAVEPOINT spm_link_/);
  assert.equal(sql.length, 2);
});
