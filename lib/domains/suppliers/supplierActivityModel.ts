import type { RoleName } from '@/lib/utils/roles';

/** Rows kept in memory for one timeline page. */
export const ACTIVITY_PAGE_SIZE = 20;

export const ACTIVITY_FILTERS = ['all', 'price', 'credits', 'alerts'] as const;

export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];

export const ACTIVITY_TYPES = [
  'PRICE_CHANGE',
  'CREDIT',
  'SHORT_SHIP',
  'QUALITY_REJECT',
  'LATE_DELIVERY',
  'NOTE',
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const CREDIT_REASONS = ['SHORT', 'DAMAGED', 'QUALITY', 'PRICING', 'OTHER'] as const;

export type CreditReason = (typeof CREDIT_REASONS)[number];

export type TimelineKind = 'activity' | 'priceVariance' | 'quality';

export type SupplierTimelineItem = {
  id: string;
  kind: TimelineKind;
  readOnly: boolean;
  createdAt: string;
  title: string;
  detail: string;
  activityType: ActivityType | null;
  source: 'AUTO' | 'MANUAL' | null;
  creditStatus: 'OPEN' | 'RECEIVED' | null;
  amount: number | null;
  voidedAt: string | null;
  voidReason: string | null;
};

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  PRICE_CHANGE: 'Price change',
  CREDIT: 'Credit',
  SHORT_SHIP: 'Short ship',
  QUALITY_REJECT: 'Quality reject',
  LATE_DELIVERY: 'Late delivery',
  NOTE: 'Note',
};

export const CREDIT_REASON_LABELS: Record<CreditReason, string> = {
  SHORT: 'Short',
  DAMAGED: 'Damaged',
  QUALITY: 'Quality',
  PRICING: 'Pricing',
  OTHER: 'Other',
};

export const ACTIVITY_FILTER_LABELS: Record<ActivityFilter, string> = {
  all: 'All',
  price: 'Price',
  credits: 'Credits',
  alerts: 'Alerts',
};

const VIEW_ROLES: RoleName[] = ['ADMIN', 'STORE_MANAGER', 'RECEIVING_CLERK'];
const CLERK_TYPES: ActivityType[] = ['SHORT_SHIP', 'QUALITY_REJECT', 'LATE_DELIVERY', 'NOTE'];
const MANAGER_TYPES: ActivityType[] = ['CREDIT', ...CLERK_TYPES];

export function canViewSupplierActivity(role: RoleName): boolean {
  return VIEW_ROLES.includes(role);
}

export function manualActivityTypesForRole(role: RoleName): ActivityType[] {
  if (role === 'ADMIN' || role === 'STORE_MANAGER') return [...MANAGER_TYPES];
  if (role === 'RECEIVING_CLERK') return [...CLERK_TYPES];
  return [];
}

export function canReceiveCredit(role: RoleName): boolean {
  return role === 'ADMIN' || role === 'STORE_MANAGER';
}

export function canVoidActivity(role: RoleName): boolean {
  return role === 'ADMIN';
}

export function parseActivityFilter(value: string | null | undefined): ActivityFilter | null {
  if (value == null || value === '' || value === 'all') return 'all';
  if (value === 'price' || value === 'credits' || value === 'alerts') return value;
  return null;
}

/** Header copy: Open credits $X (n). Counts only non-voided OPEN credits. */
export function openCreditsLabel(total: number, count: number): string {
  const amount = Number.isFinite(total) ? total : 0;
  const formatted = amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const n = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  return `Open credits ${formatted} (${n})`;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isSafeRecordId(value: string): boolean {
  return ID_PATTERN.test(value);
}
