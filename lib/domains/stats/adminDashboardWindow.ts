/**
 * Fixed admin dashboard window.
 * Day bounds match last30StoreDays + torontoRange (America/Toronto, half-open).
 * Leftover /admin?preset=&from=&to= links are ignored here; the stats API still honors them.
 */

import {
  calendarDaysInclusive,
  enumerateYmd,
  last30StoreDays,
  torontoRange,
  type StoreInstantRange,
} from '@/lib/domains/stats/storeTime';

export const ADMIN_DASHBOARD_WINDOW_DAYS = 30;
export const ADMIN_DASHBOARD_WINDOW_LABEL = 'Last 30 days';

export type IgnoredDashboardRangeQuery = {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
};

export type AdminDashboardWindow = {
  from: string;
  to: string;
  range: StoreInstantRange;
  /** from/to query for the existing /api/admin/stats route. No preset. */
  statsQuery: string;
  label: typeof ADMIN_DASHBOARD_WINDOW_LABEL;
  dayCount: number;
  days: string[];
};

export function adminDashboardWindow(now = new Date()): AdminDashboardWindow {
  const bounds = last30StoreDays(now, ADMIN_DASHBOARD_WINDOW_DAYS);
  const range = torontoRange(bounds.from, bounds.to);
  const days = enumerateYmd(bounds.from, bounds.to);
  const statsQuery = new URLSearchParams({ from: bounds.from, to: bounds.to }).toString();
  return {
    from: bounds.from,
    to: bounds.to,
    range,
    statsQuery,
    label: ADMIN_DASHBOARD_WINDOW_LABEL,
    dayCount: calendarDaysInclusive(bounds.from, bounds.to),
    days,
  };
}

/** Old dashboard range params stay in the URL and do not move this window. */
export function adminDashboardWindowIgnoringQuery(
  query?: IgnoredDashboardRangeQuery | null,
  now = new Date()
): AdminDashboardWindow {
  void query;
  return adminDashboardWindow(now);
}
