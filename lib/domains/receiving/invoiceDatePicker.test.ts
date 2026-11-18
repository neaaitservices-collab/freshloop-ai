import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DATE_REQUIRED_ERROR } from '@/lib/domains/receiving/supplierInvoiceIdentity';
import { torontoWeekdayIndex } from '@/lib/domains/stats/storeTime';
import {
  DELIVERY_DAY_TODAY,
  DELIVERY_DAY_YESTERDAY,
  INVOICE_DATE_FIELD_LABEL,
  INVOICE_DATE_WARNING,
  PICK_DELIVERY_DAY_LABEL,
  TORONTO_TIME_CAPTION,
  canAdvanceDeliveryMonth,
  deliveryMonthModel,
  formatInvoiceDeliveryDay,
  invoiceDateButtonLabel,
  invoiceDateToday,
  invoiceDateYesterday,
  isFutureDeliveryDay,
  isSelectableDeliveryDay,
  pickDeliveryDay,
  type DeliveryDayCell,
} from '@/lib/domains/receiving/invoiceDatePicker';

function days(cells: DeliveryDayCell[]) {
  return cells.flatMap((cell) => (cell.kind === 'day' ? [cell] : []));
}

test('today follows America/Toronto, including the evening before UTC midnight', () => {
  const lateEvening = new Date('2026-11-14T03:30:00.000Z');
  const afterMidnight = new Date('2026-11-14T05:30:00.000Z');
  assert.equal(invoiceDateToday(lateEvening), '2026-11-13');
  assert.equal(invoiceDateYesterday(lateEvening), '2026-11-12');
  assert.equal(invoiceDateToday(afterMidnight), '2026-11-14');
  assert.equal(invoiceDateYesterday(afterMidnight), '2026-11-13');
});

test('future days and the next month stay disabled when today is in the open month', () => {
  const now = new Date('2026-11-14T03:30:00.000Z');
  const today = invoiceDateToday(now);
  assert.equal(today, '2026-11-13');
  const november = deliveryMonthModel('2026-11-13', today, now);
  assert.equal(november.label, 'November 2026');
  assert.equal(november.monthStart, '2026-11-01');
  assert.equal(november.canGoNext, false);
  assert.equal(canAdvanceDeliveryMonth('2026-10-01', today, now), true);
  assert.equal(torontoWeekdayIndex('2026-11-01'), 0);
  assert.equal(november.cells[0]?.kind, 'day');
  assert.equal(november.cells.length, 35);
  assert.equal(november.cells.slice(-5).every((cell) => cell.kind === 'empty'), true);

  const grid = days(november.cells);
  const todayCell = grid.find((cell) => cell.ymd === '2026-11-13');
  const futureCell = grid.find((cell) => cell.ymd === '2026-11-14');
  assert.equal(todayCell?.isToday, true);
  assert.equal(todayCell?.disabled, false);
  assert.equal(isFutureDeliveryDay('2026-11-14', today), true);
  assert.equal(isSelectableDeliveryDay('2026-11-13', today), true);
  assert.equal(futureCell?.disabled, true);
  assert.equal(futureCell?.isToday, false);
  assert.deepEqual(
    grid.filter((cell) => cell.disabled).map((cell) => cell.day),
    [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]
  );

  const october = deliveryMonthModel('2026-10-01', today, now);
  assert.equal(october.canGoNext, true);
  assert.equal(days(october.cells).every((cell) => cell.disabled === false), true);

  const aprilLead = torontoWeekdayIndex('2026-04-01');
  const april = deliveryMonthModel('2026-04-01', today, now);
  assert.equal(april.cells.slice(0, aprilLead).every((cell) => cell.kind === 'empty'), true);
  assert.deepEqual(april.cells[aprilLead], {
    kind: 'day',
    ymd: '2026-04-01',
    day: 1,
    isToday: false,
    disabled: false,
  });
});

test('a chosen day is stored as YYYY-MM-DD and shown as Fri, Nov 13, 2026', () => {
  assert.equal(formatInvoiceDeliveryDay('2026-11-13'), 'Fri, Nov 13, 2026');
  assert.equal(formatInvoiceDeliveryDay('2026-11-01'), 'Sun, Nov 1, 2026');
  assert.equal(invoiceDateButtonLabel(''), PICK_DELIVERY_DAY_LABEL);
  assert.equal(invoiceDateButtonLabel('not-a-date'), PICK_DELIVERY_DAY_LABEL);
  assert.equal(invoiceDateButtonLabel('2026-11-13'), 'Fri, Nov 13, 2026');
  assert.equal(formatInvoiceDeliveryDay('2026-02-31'), '');
});

test('picking a delivery day clears the missing-date warning and closes the sheet', () => {
  assert.equal(INVOICE_DATE_WARNING, DATE_REQUIRED_ERROR);
  const open = { dateDraft: '', warning: INVOICE_DATE_WARNING, sheetOpen: true };
  const today = '2026-11-13';

  const picked = pickDeliveryDay(open, '2026-11-13', today);
  assert.equal(picked.accepted, true);
  assert.equal(picked.dateDraft, '2026-11-13');
  assert.equal(picked.dateDraft, '2026-11-13');
  assert.notEqual(picked.dateDraft, 'Fri, Nov 13, 2026');
  assert.equal(formatInvoiceDeliveryDay(picked.dateDraft), 'Fri, Nov 13, 2026');
  assert.equal(picked.warning, null);
  assert.equal(picked.sheetOpen, false);

  const yesterday = pickDeliveryDay(open, invoiceDateYesterday(new Date('2026-11-14T03:30:00.000Z')), today);
  assert.equal(yesterday.accepted, true);
  assert.equal(yesterday.dateDraft, '2026-11-12');
  assert.equal(yesterday.warning, null);
  assert.equal(yesterday.sheetOpen, false);

  const future = pickDeliveryDay(open, '2026-11-18', today);
  assert.equal(future.accepted, false);
  assert.equal(future.dateDraft, '');
  assert.equal(future.warning, INVOICE_DATE_WARNING);
  assert.equal(future.sheetOpen, true);

  const impossible = pickDeliveryDay(open, '2026-02-31', today);
  assert.equal(impossible.accepted, false);
  assert.equal(impossible.warning, INVOICE_DATE_WARNING);

  const other = pickDeliveryDay(
    { dateDraft: '', warning: 'Select a saved supplier before this invoice can be received.', sheetOpen: true },
    '2026-11-12',
    today
  );
  assert.equal(other.accepted, true);
  assert.equal(other.warning, 'Select a saved supplier before this invoice can be received.');
  assert.equal(other.dateDraft, '2026-11-12');
});

test('the receive control is the delivery-day button and the discard action stays', () => {
  const field = readFileSync('components/features/receive/InvoiceDateField.tsx', 'utf8');
  const actions = readFileSync('components/features/receive/InvoiceIdentityActions.tsx', 'utf8');
  const screen = readFileSync('components/features/receive/ReceiveScreen.tsx', 'utf8');
  assert.match(field, /PICK_DELIVERY_DAY_LABEL/);
  assert.match(field, /INVOICE_DATE_FIELD_LABEL/);
  assert.match(field, /DELIVERY_DAY_TODAY/);
  assert.match(field, /DELIVERY_DAY_YESTERDAY/);
  assert.match(field, /TORONTO_TIME_CAPTION/);
  assert.match(field, /pickDeliveryDay|onChange/);
  assert.match(actions, /InvoiceDateField/);
  assert.equal(actions.includes('placeholder="YYYY-MM-DD"'), false);
  assert.equal(actions.includes('<input'), false);
  assert.match(screen, /pickDeliveryDay/);
  assert.match(screen, /Discard scan/);
  assert.equal(INVOICE_DATE_FIELD_LABEL, 'Invoice date from the paper');
  assert.equal(DELIVERY_DAY_TODAY, 'Today');
  assert.equal(DELIVERY_DAY_YESTERDAY, 'Yesterday');
  assert.equal(TORONTO_TIME_CAPTION, 'Toronto time');
  assert.equal(/\bkitchen\b/i.test(`${field}\n${actions}`), false);
});
