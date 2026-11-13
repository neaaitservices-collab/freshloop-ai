import { departmentLabel } from '@/lib/domains/inventory/inventoryCatalog';
import { isBelowPar } from '@/lib/domains/inventory/lowStock';

/** Same 48-hour window the admin alert uses for "short-dated". */
export const SHORT_DATED_DAYS = 2;

export const ORDER_ALERT_KINDS = ['below-par', 'short-dated', 'flagged'] as const;

export type OrderAlertKind = (typeof ORDER_ALERT_KINDS)[number];

export interface OrderAlertFocus {
  /** Department code, or the display name when no code was on the alert. */
  department: string;
  /** Display name for the order banner. Falls back to `department`. */
  name: string;
  alert: OrderAlertKind;
}

type AlertRow = {
  department: string;
  category?: string;
  onHand: number;
  parUnits: number;
  daysRemaining: number;
};

export function isOrderShortDated(row: { onHand: number; daysRemaining: number }): boolean {
  return row.onHand > 0 && row.daysRemaining <= SHORT_DATED_DAYS;
}

export function parseOrderAlertSearch(input: {
  department?: string | null;
  alert?: string | null;
  name?: string | null;
}): OrderAlertFocus | null {
  const department = input.department?.trim() ?? '';
  const alert = input.alert?.trim() ?? '';
  if (!department || !ORDER_ALERT_KINDS.includes(alert as OrderAlertKind)) return null;
  const name = input.name?.trim() || department;
  return { department, name, alert: alert as OrderAlertKind };
}

export function orderAlertHref(input: {
  code?: string | null;
  department: string;
  alert: OrderAlertKind;
}): string {
  const code = input.code?.trim() ?? '';
  const departmentName = input.department.trim();
  const department = code || departmentName;
  const params = new URLSearchParams({ department, alert: input.alert });
  if (departmentName && departmentName !== department) params.set('name', departmentName);
  return `/orders?${params.toString()}`;
}

function sameLabel(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function matchesOrderDepartment(row: { department: string; category?: string }, focus: string): boolean {
  const key = focus.trim();
  if (!key) return false;
  if (sameLabel(row.department, key)) return true;
  if (row.category && sameLabel(row.category, key)) return true;
  return sameLabel(departmentLabel(row.department), key);
}

export function rowMatchesOrderAlert(row: AlertRow, focus: Pick<OrderAlertFocus, 'department' | 'alert'>): boolean {
  if (!matchesOrderDepartment(row, focus.department)) return false;
  const below = isBelowPar(row);
  const shortDated = isOrderShortDated(row);
  if (focus.alert === 'below-par') return below;
  if (focus.alert === 'short-dated') return shortDated;
  return below || shortDated;
}

export function rowsForOrderAlert<T extends AlertRow>(rows: readonly T[], focus: OrderAlertFocus): T[] {
  return rows.filter((row) => rowMatchesOrderAlert(row, focus));
}

export function orderAlertHint(low: number, expiring: number): string {
  const parts: string[] = [];
  if (low > 0) {
    const items = low === 1 ? 'item' : 'items';
    parts.push(`Below par opens a new order with those ${low} ${items} filled to par.`);
  }
  if (expiring > 0) {
    const items = expiring === 1 ? 'item' : 'items';
    parts.push(
      `Short-dated opens the same order screen with those ${expiring} ${items}, to cut the next order.`
    );
  }
  return parts.join(' ');
}
