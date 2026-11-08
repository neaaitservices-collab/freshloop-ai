import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeBatchSaveOutcome,
  describeCommitRollback,
  invoiceHoldActions,
} from '@/lib/domains/receiving/invoiceIdentityHold';

test('invoice holds require an explicit confirmation and a rename is not an automatic add', () => {
  assert.deepEqual(
    invoiceHoldActions('DATE_CONFLICT').map((action) => action.action),
    ['link-date', 'separate-document']
  );
  assert.deepEqual(
    invoiceHoldActions('WHITESPACE_CONFLICT').map((action) => action.action),
    ['link-spelling', 'separate-spelling']
  );
  assert.deepEqual(invoiceHoldActions('LINES_NEED_CONFIRMATION').map((action) => action.action), ['add-lines']);
  assert.deepEqual(invoiceHoldActions('LEGACY_RECEIPT_PRESENT').map((action) => action.action), ['adopt-legacy']);
  assert.deepEqual(invoiceHoldActions('RENAME_AMBIGUOUS').map((action) => action.action), ['map-line']);
  assert.deepEqual(invoiceHoldActions('DATE_REQUIRED'), []);
});

test('a mixed batch reports the posted row and the conflict separately', () => {
  const mixed = describeBatchSaveOutcome({
    savedCount: 1,
    replayCount: 0,
    failed: ['Pears (different cost)'],
    targetCount: 2,
  });
  assert.match(mixed.notice ?? '', /Saved 1 of 2/);
  assert.match(mixed.error ?? '', /Pears/);
  const replay = describeBatchSaveOutcome({
    savedCount: 2,
    replayCount: 2,
    failed: [],
    targetCount: 2,
  });
  assert.match(replay.notice ?? '', /already received/);
  assert.equal(replay.savedMessage, undefined);
});

test('a rolled-back commit lists each line and does not claim stock was added', () => {
  const described = describeCommitRollback({
    committed: false,
    results: [
      { itemName: 'Apples', stock: { posted: false, reason: 'Rolled back because a later line conflicted. Stock was not added for this line.' } },
      { itemName: 'Pears', stock: { posted: false, conflict: true, reason: 'different cost' } },
    ],
  });
  assert.equal(described.committed, false);
  assert.match(described.summary, /rolled back/i);
  assert.match(described.summary, /No new stock/);
  assert.equal(described.lines.length, 2);
  assert.match(described.lines[1] ?? '', /Pears/);
});
