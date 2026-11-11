/**
 * Store clock is America/Toronto (prisma Store.timezone default).
 * Calendar dates convert to a half-open UTC range with Intl, not setHours.
 */

export const STORE_TIME_ZONE = 'America/Toronto';

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export type StoreInstantRange = {
  from: string;
  to: string;
  startUtc: Date;
  /** Exclusive. Midnight Toronto of the day after `to`. */
  endUtc: Date;
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function isValidYmd(value: string): boolean {
  const match = YMD.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

/** Calendar-day arithmetic in UTC so a 23h or 25h Toronto day cannot shift the date. */
export function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return formatYmd(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

export function calendarDaysInclusive(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  const span = Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1);
  return Math.round(span / 86_400_000) + 1;
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function zonedParts(date: Date, timeZone = STORE_TIME_ZONE): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal') bag[part.type] = part.value;
  }
  let hour = Number(bag.hour);
  let day = Number(bag.day);
  let month = Number(bag.month);
  let year = Number(bag.year);
  if (hour === 24) {
    hour = 0;
    const next = addCalendarDays(formatYmd(year, month, day), 1);
    const [ny, nm, nd] = next.split('-').map(Number);
    year = ny;
    month = nm;
    day = nd;
  }
  return {
    year,
    month,
    day,
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

/** UTC instant of a Toronto wall-clock time. Two passes settle the DST offset. */
export function zonedTimeToUtc(
  ymd: string,
  hour: number,
  minute = 0,
  second = 0,
  timeZone = STORE_TIME_ZONE
): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = target;
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = zonedParts(new Date(utc), timeZone);
    const localAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const diff = localAsUtc - target;
    if (diff === 0) break;
    utc -= diff;
  }
  return new Date(utc);
}

export function torontoYmd(date: Date, timeZone = STORE_TIME_ZONE): string {
  const parts = zonedParts(date, timeZone);
  return formatYmd(parts.year, parts.month, parts.day);
}

export function torontoToday(now = new Date()): string {
  return torontoYmd(now);
}

/** Inclusive local dates → [startUtc, endUtc). */
export function torontoRange(from: string, to: string): StoreInstantRange {
  return {
    from,
    to,
    startUtc: zonedTimeToUtc(from, 0, 0, 0),
    endUtc: zonedTimeToUtc(addCalendarDays(to, 1), 0, 0, 0),
  };
}

export function torontoWeekdayIndex(ymd: string): number {
  const noon = zonedTimeToUtc(ymd, 12, 0, 0);
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: STORE_TIME_ZONE,
    weekday: 'short',
  }).format(noon);
  return WEEKDAY[name] ?? 0;
}

/** Sunday through Saturday in the store calendar. */
export function sundayWeekContaining(ymd: string): { from: string; to: string } {
  const from = addCalendarDays(ymd, -torontoWeekdayIndex(ymd));
  return { from, to: addCalendarDays(from, 6) };
}

export function calendarMonthContaining(ymd: string): { from: string; to: string } {
  const [year, month] = ymd.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: formatYmd(year, month, 1), to: formatYmd(year, month, last) };
}

export function presetRange(
  preset: 'day' | 'week' | 'month',
  now = new Date()
): { from: string; to: string } {
  const today = torontoToday(now);
  if (preset === 'day') return { from: today, to: today };
  if (preset === 'week') return sundayWeekContaining(today);
  return calendarMonthContaining(today);
}

export function shiftStoreRange(
  from: string,
  to: string,
  direction: -1 | 1
): { from: string; to: string } {
  const [year, month, day] = from.split('-').map(Number);
  const monthStart = day === 1 && to === calendarMonthContaining(from).to;
  if (monthStart) {
    const next = new Date(Date.UTC(year, month - 1 + direction, 1));
    return calendarMonthContaining(formatYmd(next.getUTCFullYear(), next.getUTCMonth() + 1, 1));
  }
  const span = calendarDaysInclusive(from, to);
  const delta = direction * span;
  return { from: addCalendarDays(from, delta), to: addCalendarDays(to, delta) };
}

export function enumerateYmd(from: string, to: string): string[] {
  const count = calendarDaysInclusive(from, to);
  const days: string[] = [];
  for (let index = 0; index < count; index += 1) days.push(addCalendarDays(from, index));
  return days;
}

/** Inclusive Toronto dates for the rolling admin card window (today and the previous 29 days). */
export function last30StoreDays(now = new Date(), days = 30): { from: string; to: string } {
  const to = torontoToday(now);
  return { from: addCalendarDays(to, -(days - 1)), to };
}

/** Card caption such as Nov 1–10. Same-month ranges drop the repeated month. */
export function formatCardRangeLabel(from: string, to: string): string {
  const monthDay = (ymd: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: STORE_TIME_ZONE,
      month: 'short',
      day: 'numeric',
    }).format(zonedTimeToUtc(ymd, 12, 0, 0));
  if (from === to) return monthDay(from);
  const start = monthDay(from);
  const end = monthDay(to);
  const startMonth = start.slice(0, start.lastIndexOf(' '));
  const endMonth = end.slice(0, end.lastIndexOf(' '));
  if (from.slice(0, 4) === to.slice(0, 4) && startMonth === endMonth) {
    return `${start}–${end.slice(end.lastIndexOf(' ') + 1)}`;
  }
  if (from.slice(0, 4) === to.slice(0, 4)) return `${start}–${end}`;
  return `${formatRangeLabel(from, to)}`;
}

export function formatRangeLabel(from: string, to: string): string {
  const label = (ymd: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: STORE_TIME_ZONE,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(zonedTimeToUtc(ymd, 12, 0, 0));
  if (from === to) return label(from);
  return `${label(from)} – ${label(to)}`;
}

export function formatTorontoDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: STORE_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatBucketLabel(ymd: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: STORE_TIME_ZONE,
    month: 'short',
    day: 'numeric',
  }).format(zonedTimeToUtc(ymd, 12, 0, 0));
}
