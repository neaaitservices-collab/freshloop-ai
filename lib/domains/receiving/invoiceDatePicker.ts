/**
 * Delivery-day picker for a missing invoice date.
 * Today is the America/Toronto calendar day. The stored value stays YYYY-MM-DD.
 * The warning sentence matches DATE_REQUIRED_ERROR without importing the ledger.
 */

import {
  addCalendarDays,
  calendarMonthContaining,
  formatYmd,
  isValidYmd,
  torontoToday,
  torontoWeekdayIndex,
  STORE_TIME_ZONE,
  zonedTimeToUtc,
} from '@/lib/domains/stats/storeTime';

export const INVOICE_DATE_WARNING =
  'Enter the invoice date from the paper before this invoice can be received. A missing date was not matched to another delivery.';

export const INVOICE_DATE_FIELD_LABEL = 'Invoice date from the paper';
export const PICK_DELIVERY_DAY_LABEL = 'Pick the delivery day';
export const DELIVERY_DAY_TODAY = 'Today';
export const DELIVERY_DAY_YESTERDAY = 'Yesterday';
export const TORONTO_TIME_CAPTION = 'Toronto time';
export const DELIVERY_WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

export type DeliveryDayCell =
  | { kind: 'empty' }
  | { kind: 'day'; ymd: string; day: number; isToday: boolean; disabled: boolean };

export type DeliveryMonthModel = {
  monthStart: string;
  label: string;
  canGoNext: boolean;
  cells: DeliveryDayCell[];
};

export type DeliveryDayPickState = {
  dateDraft: string;
  warning: string | null;
  sheetOpen: boolean;
};

export type DeliveryDayPick = DeliveryDayPickState & { accepted: boolean };

export function invoiceDateToday(now = new Date()): string {
  return torontoToday(now);
}

export function invoiceDateYesterday(now = new Date()): string {
  return addCalendarDays(invoiceDateToday(now), -1);
}

export function startOfDeliveryMonth(ymd: string, now = new Date()): string {
  const day = isValidYmd(ymd) ? ymd : invoiceDateToday(now);
  const [year, month] = day.split('-').map(Number);
  return formatYmd(year, month, 1);
}

export function shiftDeliveryMonth(monthStart: string, delta: -1 | 1, now = new Date()): string {
  const start = startOfDeliveryMonth(monthStart, now);
  const [year, month] = start.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  return formatYmd(next.getUTCFullYear(), next.getUTCMonth() + 1, 1);
}

/** A day can be received when it is a real calendar date on or before Toronto today. */
export function isSelectableDeliveryDay(ymd: string, today: string): boolean {
  const day = ymd.trim();
  return isValidYmd(day) && isValidYmd(today) && day <= today;
}

export function isFutureDeliveryDay(ymd: string, today: string): boolean {
  const day = ymd.trim();
  return isValidYmd(day) && isValidYmd(today) && day > today;
}

/** Next month stays closed when that month has no day on or before today. */
export function canAdvanceDeliveryMonth(monthStart: string, today: string, now = new Date()): boolean {
  if (!isValidYmd(today)) return false;
  return shiftDeliveryMonth(monthStart, 1, now) <= today;
}

export function formatInvoiceDeliveryDay(ymd: string): string {
  const day = ymd.trim();
  if (!isValidYmd(day)) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: STORE_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(zonedTimeToUtc(day, 12, 0, 0));
}

export function deliveryMonthLabel(monthStart: string, now = new Date()): string {
  const start = startOfDeliveryMonth(monthStart, now);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: STORE_TIME_ZONE,
    month: 'long',
    year: 'numeric',
  }).format(zonedTimeToUtc(start, 12, 0, 0));
}

export function invoiceDateButtonLabel(dateDraft: string): string {
  const label = formatInvoiceDeliveryDay(dateDraft);
  return label || PICK_DELIVERY_DAY_LABEL;
}

export function deliveryMonthModel(monthStart: string, today: string, now = new Date()): DeliveryMonthModel {
  const start = startOfDeliveryMonth(monthStart, now);
  const safeToday = isValidYmd(today) ? today : invoiceDateToday(now);
  const { to } = calendarMonthContaining(start);
  const lastDay = Number(to.slice(8));
  const [year, month] = start.split('-').map(Number);
  const lead = torontoWeekdayIndex(start);
  const cells: DeliveryDayCell[] = [];
  for (let index = 0; index < lead; index += 1) cells.push({ kind: 'empty' });
  for (let day = 1; day <= lastDay; day += 1) {
    const ymd = formatYmd(year, month, day);
    cells.push({
      kind: 'day',
      ymd,
      day,
      isToday: ymd === safeToday,
      disabled: !isSelectableDeliveryDay(ymd, safeToday),
    });
  }
  while (cells.length % 7 !== 0) cells.push({ kind: 'empty' });
  return {
    monthStart: start,
    label: deliveryMonthLabel(start, now),
    canGoNext: canAdvanceDeliveryMonth(start, safeToday, now),
    cells,
  };
}

/**
 * One tap stores YYYY-MM-DD, closes the sheet, and drops the missing-date warning.
 * A future or impossible day leaves the draft, the warning, and the sheet alone.
 */
export function pickDeliveryDay(
  state: DeliveryDayPickState,
  ymd: string,
  today: string
): DeliveryDayPick {
  const day = ymd.trim();
  if (!isSelectableDeliveryDay(day, today)) {
    return { ...state, accepted: false };
  }
  return {
    dateDraft: day,
    warning: state.warning === INVOICE_DATE_WARNING ? null : state.warning,
    sheetOpen: false,
    accepted: true,
  };
}
