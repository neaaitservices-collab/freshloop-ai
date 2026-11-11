import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { RENAME_AMBIGUOUS_ERROR } from '@/lib/domains/receiving/supplierInvoiceIdentity';
import {
  actionsForIdentityHold,
  firstRenamePair,
} from '@/lib/domains/receiving/invoiceIdentityHold';
import {
  applyServerDeliveryIds,
  lineHasServerDeliveryId,
  lineLacksServerDeliveryId,
  matchPrintedSlots,
  receiveLineSaveGate,
  unidentifiedInvoiceSaveMessage,
} from '@/lib/domains/receiving/invoiceReceiveSave';
import { SUPPLIER_REQUIRED_ERROR } from '@/lib/domains/receiving/invoiceDeliveryId';
import {
  ADD_OCR_SUPPLIER_VALUE,
  supplierInvoiceSavePlan,
} from '@/lib/domains/suppliers/supplierInvoiceMatch';

const VANILLA = '11111111-1111-4111-8111-111111111111';
const LEMON = '22222222-2222-4222-8222-222222222222';

function openLine(index: number, name: string) {
  return {
    id: `unassigned-invoice-line-${index}`,
    itemName: name,
    printedName: name,
    invoiceNumber: '899559',
    casesReceived: 2,
    caseCost: 62.4,
    canPost: false as const,
  };
}

test('an open invoice with no delivery ids cannot save until a supplier is picked and lines are identified', () => {
  const lines = [
    openLine(1, 'CLASSIC VANILLA'),
    openLine(2, 'LEMON ZEST'),
    ...Array.from({ length: 6 }, (_, index) => openLine(index + 3, `LINE ${index + 3}`)),
  ];
  assert.equal(lines.length, 8);
  assert.equal(lines.every((line) => lineLacksServerDeliveryId(line)), true);
  assert.equal(lines.every((line) => lineHasServerDeliveryId(line)), false);

  const blocked = receiveLineSaveGate({
    invoiceNumber: lines[0]?.invoiceNumber,
    supplierId: '',
    lineId: lines[0]!.id,
    canPost: lines[0]?.canPost,
    identityPhase: 'idle',
  });
  assert.equal(blocked.canSave, false);
  assert.equal(blocked.promptSupplier, true);
  assert.equal(blocked.showSupplierPicker, true);
  assert.equal(blocked.message, SUPPLIER_REQUIRED_ERROR);
  assert.equal(
    supplierInvoiceSavePlan({ ocrName: 'Tony Deodato & Sons', selectedSupplierId: '' }).action,
    'blocked'
  );

  const identified = applyServerDeliveryIds(lines, [
    { deliveryId: VANILLA, ordinal: 0 },
    { deliveryId: LEMON, ordinal: 1 },
    ...lines.slice(2).map((_, index) => ({
      deliveryId: `33333333-3333-4333-8333-33333333333${index}`,
      ordinal: index + 2,
    })),
  ]);
  assert.equal(identified[0]?.id, VANILLA);
  assert.equal(identified[0]?.canPost, true);
  assert.equal(lineHasServerDeliveryId(identified[0]!), true);
  assert.equal(identified.every((line) => lineHasServerDeliveryId(line)), true);

  const ready = receiveLineSaveGate({
    invoiceNumber: '899559',
    supplierId: 'sup_deodato',
    lineId: identified[0]!.id,
    canPost: identified[0]?.canPost,
    identityPhase: 'ready',
  });
  assert.equal(ready.canSave, true);
  assert.equal(ready.promptSupplier, false);
  assert.equal(ready.message, null);
});

test('a rename keeps delivery ids for lines that still match and does not ask for a supplier again', () => {
  const storedLemon = '44444444-4444-4444-8444-444444444444';
  const match = matchPrintedSlots(
    [
      { id: VANILLA, printedKey: 'classic vanilla', occurrence: 0, aliases: [] },
      { id: storedLemon, printedKey: 'lemon zest', occurrence: 0, aliases: [] },
    ],
    [
      { printedKey: 'classic vanilla', occurrence: 0 },
      { printedKey: 'lemon ice', occurrence: 0 },
    ]
  );
  assert.equal(match.matched.length, 1);
  assert.equal(match.matched[0]?.deliveryId, VANILLA);
  assert.deepEqual(match.unmatchedScan, ['lemon ice']);
  assert.equal(match.unused[0]?.id, storedLemon);

  const logs = [openLine(1, 'CLASSIC VANILLA'), openLine(2, 'LEMON ICE')];
  const applied = applyServerDeliveryIds(logs, match.matched);
  assert.equal(applied[0]?.id, VANILLA);
  assert.equal(applied[0]?.canPost, true);
  assert.equal(applied[1]?.id, 'unassigned-invoice-line-2');
  assert.equal(applied[1]?.canPost, false);

  const vanilla = receiveLineSaveGate({
    invoiceNumber: '899559',
    supplierId: 'sup_deodato',
    lineId: applied[0]!.id,
    canPost: applied[0]?.canPost,
    identityPhase: 'held',
    identityMessage: RENAME_AMBIGUOUS_ERROR,
  });
  assert.equal(vanilla.canSave, true);

  const drifted = receiveLineSaveGate({
    invoiceNumber: '899559',
    supplierId: 'sup_deodato',
    lineId: applied[1]!.id,
    canPost: applied[1]?.canPost,
    identityPhase: 'held',
    identityMessage: RENAME_AMBIGUOUS_ERROR,
  });
  assert.equal(drifted.canSave, false);
  assert.equal(drifted.promptSupplier, false);
  assert.equal(drifted.message, RENAME_AMBIGUOUS_ERROR);
  assert.equal(unidentifiedInvoiceSaveMessage({
    supplierId: 'sup_deodato',
    identityPhase: 'held',
    identityMessage: RENAME_AMBIGUOUS_ERROR,
    unidentifiedCount: 1,
  }), RENAME_AMBIGUOUS_ERROR);

  const hold = {
    code: 'RENAME_AMBIGUOUS',
    newPrintedNames: match.unmatchedScan,
    unmatchedStoredLines: match.unused,
  };
  assert.deepEqual(
    actionsForIdentityHold(hold).map((action) => action.action),
    ['map-line']
  );
  assert.equal(firstRenamePair(hold)?.fromLineId, storedLemon);
  assert.equal(firstRenamePair(hold)?.mappedPrintedName, 'lemon ice');
});

test('several drifted lines still offer one map at a time, and an empty pick does not create a supplier', () => {
  const names = Array.from({ length: 8 }, (_, index) => `new line ${index + 1}`);
  const stored = names.map((_, index) => ({ id: `stored-${index}`, printedKey: `old line ${index + 1}` }));
  assert.deepEqual(
    actionsForIdentityHold({
      code: 'RENAME_AMBIGUOUS',
      newPrintedNames: names,
      unmatchedStoredLines: stored,
    }).map((action) => action.action),
    ['map-line']
  );
  assert.equal(
    actionsForIdentityHold({ code: 'RENAME_AMBIGUOUS', newPrintedNames: [], unmatchedStoredLines: [] }).length,
    0
  );
  assert.equal(
    supplierInvoiceSavePlan({ ocrName: 'Tony Deodato & Sons', selectedSupplierId: 'sup_deodato' }).action,
    'link'
  );
  const created = supplierInvoiceSavePlan({
    ocrName: 'Tony Deodato & Sons',
    selectedSupplierId: ADD_OCR_SUPPLIER_VALUE,
  });
  assert.equal(created.action, 'create');
  if (created.action === 'create') assert.equal(created.name, 'Tony Deodato & Sons');
});

test('the receive screen prompts for a supplier next to an unidentified invoice line', () => {
  const dashboard = fs.readFileSync(
    path.join(process.cwd(), 'components/features/receive/YieldPricingDashboard.tsx'),
    'utf8'
  );
  const inline = fs.readFileSync(
    path.join(process.cwd(), 'components/features/receive/InlineInvoiceSupplier.tsx'),
    'utf8'
  );
  const screen = fs.readFileSync(
    path.join(process.cwd(), 'components/features/receive/ReceiveScreen.tsx'),
    'utf8'
  );
  assert.match(dashboard, /InlineInvoiceSupplier/);
  assert.match(dashboard, /lineLacksServerDeliveryId/);
  assert.match(dashboard, /receiveLineSaveGate/);
  assert.match(inline, /supplierInvoiceSavePlan/);
  assert.match(inline, /Saved supplier for this invoice/);
  assert.equal(inline.includes('useEffect'), false);
  const confirmAt = inline.indexOf('const confirmAdd');
  const fetchAt = inline.indexOf("fetch('/api/receiving-suppliers'");
  assert.ok(confirmAt >= 0 && fetchAt > confirmAt);
  assert.match(screen, /applyServerDeliveryIds/);
  assert.match(screen, /identifiedLines/);
  assert.match(screen, /actionsForIdentityHold|InvoiceIdentityActions/);
});
