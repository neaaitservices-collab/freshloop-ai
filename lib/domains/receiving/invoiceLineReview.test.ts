import assert from 'node:assert/strict';
import test from 'node:test';
import { matchInvoiceLine, type SupplierProductLinkRef } from '@/lib/domains/receiving/supplierProductMatch';
import {
  fuzzyCandidatesNeedCheck,
  isInvoiceLevelBlocker,
  lineNeedsCheck,
  receiveLinePill,
  reviewChipLabel,
  reviewCounts,
  withDefaultCreateNew,
  type ReceiveLineFacts,
} from '@/lib/domains/receiving/invoiceLineReview';

const catalog = [
  { id: 'apples', name: 'Honeycrisp Apples' },
  { id: 'tomatoes', name: 'Hot House Tomatoes' },
  { id: 'lemons', name: 'Lemons' },
];

const coded: SupplierProductLinkRef = {
  matchType: 'code',
  matchKey: 'AB12',
  printedValue: 'ab-12',
  productId: 'apples',
  productName: 'Honeycrisp Apples',
};

const learned: SupplierProductLinkRef = {
  matchType: 'name',
  matchKey: 'hot house tomatoes on',
  printedValue: 'Hot House Tomatoes, ON',
  productId: 'tomatoes',
  productName: 'Hot House Tomatoes',
};

test('match order falls through to a new item when nothing hits', () => {
  const byCode = matchInvoiceLine({ code: 'ab-12', name: 'Lemons', links: [coded, learned], catalog });
  assert.equal(byCode.source, 'code');
  assert.equal(byCode.runnerUpScore, null);
  assert.equal(withDefaultCreateNew([{ product_id: byCode.product?.id ?? '' }])[0]?.create_new, undefined);

  const byName = matchInvoiceLine({ code: '', name: 'HOT HOUSE TOMATOES ON', links: [learned], catalog });
  assert.equal(byName.source, 'learned_name');
  assert.equal(lineNeedsCheck({ matchSource: 'learned_name', fuzzyAmbiguous: true }), false);

  const fuzzy = matchInvoiceLine({ name: 'Lemons', links: [], catalog });
  assert.equal(fuzzy.source, 'name');
  assert.equal(fuzzy.product?.id, 'lemons');

  const miss = matchInvoiceLine({ name: 'Dragonfruit', links: [], catalog });
  assert.equal(miss.product, null);
  assert.equal(miss.source, null);
  const created = withDefaultCreateNew([{ product_id: '' }, { product_id: 'lemons', create_new: false }]);
  assert.equal(created[0]?.create_new, true);
  assert.equal(created[1]?.create_new, false);
});

test('lineNeedsCheck is only a close fuzzy pair or an unreadable qty or price', () => {
  assert.equal(fuzzyCandidatesNeedCheck(90, 86), true);
  assert.equal(fuzzyCandidatesNeedCheck(90, 80), false);
  assert.equal(fuzzyCandidatesNeedCheck(90, null), false);
  assert.equal(fuzzyCandidatesNeedCheck(40, 40), false);

  assert.equal(lineNeedsCheck({ matchSource: 'name', fuzzyAmbiguous: true }), true);
  assert.equal(lineNeedsCheck({ matchSource: 'code', fuzzyAmbiguous: true }), false);
  assert.equal(lineNeedsCheck({ matchSource: 'learned_name', fuzzyAmbiguous: true }), false);
  assert.equal(lineNeedsCheck({ matchSource: 'code', quantityUnreadable: true }), true);
  assert.equal(lineNeedsCheck({ matchSource: 'learned_name', costUnreadable: true }), true);
  assert.equal(lineNeedsCheck({ matchSource: 'name', fuzzyAmbiguous: false }), false);
  assert.equal(lineNeedsCheck({ nameUnreadable: true, requiresApproval: true }), false);
});

test('one pill, first reason wins, and raw codes stay off the line', () => {
  const base: ReceiveLineFacts = {
    productId: 'apples',
    matchSource: 'code',
    matchPrintedValue: 'ab-12',
    name: 'Honeycrisp',
  };
  assert.equal(receiveLinePill({ ...base, quantityUnreadable: true, costUnreadable: true }), 'Check: qty not read');
  assert.equal(receiveLinePill({ ...base, costUnreadable: true }), 'Check: price not read');
  assert.equal(
    receiveLinePill({ productId: 'a', matchSource: 'name', fuzzyAmbiguous: true, name: 'Peppers' }),
    'Check: pick one'
  );
  assert.equal(receiveLinePill({ ...base, nameUnreadable: true, requiresApproval: true }), 'Name not read');
  assert.equal(receiveLinePill({ ...base, requiresApproval: true, lineTotalMismatch: true }), 'Price jump');
  assert.equal(receiveLinePill({ ...base, lineTotalMismatch: true, unitInvalid: true }), "Total doesn't add up");
  assert.equal(receiveLinePill({ ...base, unitInvalid: true, departmentAssumed: true }), 'Check unit');
  assert.equal(receiveLinePill({ ...base, departmentAssumed: true }), 'Pick department');
  assert.equal(receiveLinePill(base), 'Matched by code · ab-12');
  assert.equal(
    receiveLinePill({ productId: 'tomatoes', matchSource: 'learned_name', name: 'Tomatoes' }),
    'Matched by saved name'
  );
  assert.equal(receiveLinePill({ productId: 'lemons', matchSource: 'name', name: 'Lemons' }), 'Matched');
  assert.equal(receiveLinePill({ name: 'Dragonfruit', supplierCode: 'ZZ9' } as ReceiveLineFacts), 'New item');
  assert.equal(receiveLinePill({ matchSource: 'code', productId: 'apples', name: 'Apples' }), 'Matched by code');
});

test('a 35-line Deodato invoice is only Matched or New item, and the chip adds up', () => {
  const names = [
    'ORGANIC BANANA',
    '15KG CLEMENTINES',
    'KIWI FRUIT BULK 10KG',
    'MANGOES',
    'SIZE 6 GOLDEN RIPE PINEAPPLE',
    'POMEGRANATE',
    'WATERMELON RADISH',
    'ASPARAGUS 11LB',
    'GREEN BEANS',
    "BROCCOLI 18'S",
    'BRUSSEL SPROUTS',
    '10LB RAINBOW CARROT',
    'CAULIFLOWER 12',
    'CELERY 24',
    'GRAPES RED SEEDLESS',
    'MIXED LETTUCE GREENS',
    'SUGAR PEAS',
    'ROMAINE 24 CANADIAN',
    'GREEN ONIONS',
    'ITALIAN PARSLEY',
    'RADICCHIO',
    'GRAPE TOMATO MEDLEY 12X1',
    'BAG BASIL',
    'ENGLISH CUCUMBER MEDIUM',
    'XL ORANGE PEPPERS',
    'PEPPERS RED XL 5KG CASE',
    'PEPPERS YELLOW XL 5KG CASE',
    'ZUCCHINI',
    'ESCHALLOTS',
    'VIDALIA ONIONS',
    'RED ONION JUMBO',
    'YUKON GOLD A POTATO',
    'YAMS',
    '3LB BABY ARUGULA',
    'BLUEBERRIES 12X1 HALF PINT',
  ];
  assert.equal(names.length, 35);
  const shelf = [
    { id: 'mangoes', name: 'Mangoes' },
    { id: 'zucchini', name: 'Zucchini' },
    { id: 'yams', name: 'Yams' },
  ];
  const lines = names.map((name) => {
    const hit = matchInvoiceLine({ name, links: [], catalog: shelf });
    const productId = hit.product?.id ?? '';
    const facts: ReceiveLineFacts = {
      name,
      productId,
      matchSource: hit.source,
      fuzzyAmbiguous: hit.source === 'name' && fuzzyCandidatesNeedCheck(hit.score, hit.runnerUpScore),
    };
    return { productId, facts, createNew: !productId };
  });
  const decided = withDefaultCreateNew(lines.map((line) => ({ product_id: line.productId })));
  assert.equal(decided.filter((line) => line.create_new === true).length, 32);
  assert.deepEqual(
    lines.filter((line) => line.productId).map((line) => line.productId),
    ['mangoes', 'zucchini', 'yams']
  );
  for (const line of lines) {
    const pill = receiveLinePill(line.facts);
    assert.ok(pill === 'Matched' || pill === 'New item', pill);
    assert.equal(lineNeedsCheck(line.facts), false);
  }
  const counts = reviewCounts(lines.map((line) => line.facts));
  assert.equal(counts.matched + counts.created + counts.check, 35);
  assert.equal(counts.check, 0);
  assert.equal(counts.matched, 3);
  assert.equal(counts.created, 32);
  assert.equal(reviewChipLabel(counts), 'Matched 3 · New 32 · Check 0');
  assert.equal(isInvoiceLevelBlocker('Vendor name was not read.'), true);
  assert.equal(isInvoiceLevelBlocker('Line 4 is unresolved (quantity_unreadable).'), false);
});
