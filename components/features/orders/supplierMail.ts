import type { StockLevel } from '@/lib/domains/inventory/stock';
import { isOrderShortDated } from '@/lib/domains/orders/orderAlertLink';

export type LineMark = 'approved' | 'sent';

export interface SupplierDirectoryEntry {
  id?: string | null;
  name: string;
  contactEmail?: string | null;
}

export type SupplierRecipientIssue = 'missing' | 'ambiguous';

export const MISSING_SUPPLIER_EMAIL_HINT =
  'No email saved for this supplier. Add it in Suppliers.';

export const INVALID_SUPPLIER_EMAIL_HINT = 'Enter one supplier email address.';

/** One mailbox. Rejects lists, copies, and display-name wrappers. */
export function singleSupplierEmail(value: string): string | null {
  const email = value.trim();
  if (!email || email.length > 320) return null;
  if (/[\s,;<>?&=%#/]/.test(email)) return null;
  if ((email.match(/@/g) ?? []).length !== 1) return null;
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(email)) {
    return null;
  }
  return email;
}

export const AMBIGUOUS_SUPPLIER_EMAIL_HINT =
  'More than one supplier matches this name. Add it in Suppliers.';

export interface PoDraft {
  supplier: string;
  /** Directory id when one supplier matched. The server also resolves by name. */
  supplierId?: string | null;
  to: string;
  subject: string;
  body: string;
  productIds: string[];
  /** Why To was left blank. Absent when a single stored address was used. */
  recipientIssue?: SupplierRecipientIssue;
}

/** A stored contact address, or blank so the buyer types one. Never invent a domain. */
export function storedSupplierRecipient(email: string | null | undefined): string {
  return typeof email === 'string' ? email.trim() : '';
}

export function caseWord(count: number): string {
  return count === 1 ? 'case' : 'cases';
}

export function orderLine(row: StockLevel): string {
  if (row.orderCases > 0) {
    return `${row.orderCases} ${caseWord(row.orderCases)} - ${row.name}`;
  }
  if (isOrderShortDated(row)) return `Short-dated - ${row.name}`;
  return `In stock - ${row.name}`;
}

export function openOrderRows(rows: StockLevel[], marks: Record<string, LineMark>): StockLevel[] {
  return rows.filter((row) => row.low && marks[row.productId] !== 'sent');
}

export function approvedOrderRows(rows: StockLevel[], marks: Record<string, LineMark>): StockLevel[] {
  return openOrderRows(rows, marks).filter((row) => marks[row.productId] === 'approved');
}

export function draftForRows(
  supplier: string,
  rows: StockLevel[],
  storedEmail?: string | null
): PoDraft {
  const lines = rows.map(orderLine);
  return {
    supplier,
    to: storedSupplierRecipient(storedEmail),
    subject: `Supermarket Purchase Order - ${supplier}`,
    body: lines.join('\n'),
    productIds: rows.map((row) => row.productId),
  };
}

function supplierNameKey(name: string): string {
  return name.trim().toLowerCase();
}

function rowsForSupplier(supplier: string, rows: StockLevel[]): StockLevel[] {
  const key = supplierNameKey(supplier);
  return rows.filter((row) => supplierNameKey(row.supplier) === key);
}

/** Match a buy-list supplier to directory rows by trimmed, case-insensitive name. */
export function matchSupplierRecipient(
  supplierName: string,
  directory: readonly SupplierDirectoryEntry[]
):
  | { status: 'matched'; email: string; supplierId: string | null }
  | { status: 'missing' }
  | { status: 'ambiguous' } {
  const key = supplierNameKey(supplierName);
  if (!key) return { status: 'missing' };
  const matches = directory.filter((entry) => supplierNameKey(entry.name) === key);
  if (matches.length === 0) return { status: 'missing' };
  if (matches.length > 1) return { status: 'ambiguous' };
  const email = storedSupplierRecipient(matches[0]?.contactEmail);
  if (!email) return { status: 'missing' };
  const supplierId = matches[0]?.id?.trim() || null;
  return { status: 'matched', email, supplierId };
}

export function supplierRecipientHint(
  draft: Pick<PoDraft, 'to' | 'recipientIssue'>
): string | null {
  if (draft.to.trim() && !singleSupplierEmail(draft.to)) return INVALID_SUPPLIER_EMAIL_HINT;
  if (draft.to.trim()) return null;
  if (draft.recipientIssue === 'ambiguous') return AMBIGUOUS_SUPPLIER_EMAIL_HINT;
  return MISSING_SUPPLIER_EMAIL_HINT;
}

/** One supplier, one draft. To is that supplier's stored address, or blank. */
export function draftForSupplier(
  supplier: string,
  rows: StockLevel[],
  directory: readonly SupplierDirectoryEntry[]
): PoDraft {
  const ownRows = rowsForSupplier(supplier, rows);
  const match = matchSupplierRecipient(supplier, directory);
  if (match.status === 'matched') {
    return { ...draftForRows(supplier, ownRows, match.email), supplierId: match.supplierId };
  }
  return {
    ...draftForRows(supplier, ownRows, null),
    to: '',
    recipientIssue: match.status,
    supplierId: null,
  };
}

/** One draft per supplier. Never joins recipients or lines across suppliers. */
export function draftsForSuppliers(
  groups: ReadonlyArray<{ supplier: string; rows: StockLevel[] }>,
  directory: readonly SupplierDirectoryEntry[]
): PoDraft[] {
  return groups
    .filter((group) => rowsForSupplier(group.supplier, group.rows).length > 0)
    .map((group) => draftForSupplier(group.supplier, group.rows, directory));
}

function hashLineKey(value: string): string {
  const seeds = [0x811c9dc5, 0x01000193, 0x811c9dc5 ^ 0x9e3779b9, 0x85ebca6b];
  return seeds
    .map((seed) => {
      let hash = seed;
      for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
      }
      return (hash >>> 0).toString(16).padStart(8, '0');
    })
    .join('');
}

/** Stable idempotency key for one supplier's current order lines. */
export function purchaseOrderLineKey(draft: {
  supplier: string;
  productIds: readonly string[];
  body: string;
}): string {
  const ids = [...draft.productIds].map((id) => id.trim()).filter(Boolean).sort();
  const body = draft.body.replace(/\r\n/g, '\n').trim();
  return hashLineKey(`${draft.supplier.trim().toLowerCase()}\n${ids.join('\n')}\n${body}`);
}

export const GMAIL_COMPOSE_URL_LIMIT = 8000;
/** Mailto URLs past this length are dropped by some mail apps and browsers. */
export const MAILTO_URL_LIMIT = 2000;
export const ORDER_TRUNCATED_NOTE = '\n…(order truncated, see attached/full list)';
export const PURCHASE_ORDER_GROUP_SUBJECT = 'Supermarket Purchase Order';

function torontoClock(openedAt: string): string | null {
  const time = new Date(openedAt);
  if (Number.isNaN(time.getTime())) return null;
  return time
    .toLocaleTimeString('en-US', {
      timeZone: 'America/Toronto',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .replace(/[\u202f\u00a0]/g, ' ');
}

/** One line for when this order was opened, in America/Toronto. */
export function purchaseOrderOpenedWarning(openedAt: string): string {
  const label = torontoClock(openedAt);
  return label ? `Opened ${label}` : `Opened ${openedAt}`;
}

/** Ask before opening a purchase order that was already opened. */
export function purchaseOrderRepeatWarning(openedAt: string): string {
  const label = torontoClock(openedAt) ?? (openedAt.trim() || 'unknown time');
  return `Already opened at ${label} (Toronto). Open again?`;
}

/** 409 holds the mailto until the buyer confirms. Other failures stay in the issues list. */
export function purchaseOrderRepeatGate(status: number): 'open' | 'confirm' | 'issue' {
  if (status === 409) return 'confirm';
  if (status >= 200 && status < 300) return 'open';
  return 'issue';
}

/** Supplier and line identity. To, subject, and body are text and stay out of it. */
export function purchaseOrderOpenIdentity(draft: {
  supplier: string;
  supplierId?: string | null;
  productIds: readonly string[];
}): string {
  const id = draft.supplierId?.trim() || draft.supplier.trim().toLowerCase();
  const products = [...draft.productIds].map((productId) => productId.trim()).filter(Boolean).sort();
  return `${id}\n${products.join(',')}`;
}

/** One check for the set of suppliers being opened. To, subject, and body do not change it. */
export function purchaseOrderCheckKey(
  drafts: readonly {
    supplier: string;
    supplierId?: string | null;
    productIds: readonly string[];
    to?: string;
    subject?: string;
    body?: string;
  }[]
): string {
  return drafts.map((draft) => purchaseOrderOpenIdentity(draft)).sort().join('\n');
}

export function purchaseOrderRememberOpen(
  known: Record<string, { state: 'checking' | 'ready' | 'opened'; openedAt?: string }>,
  id: string,
  status: number,
  openedAt?: string
): Record<string, { state: 'checking' | 'ready' | 'opened'; openedAt?: string }> {
  if (status === 409 || (status >= 200 && status < 300)) {
    return { ...known, [id]: { state: 'opened', openedAt } };
  }
  return known;
}

export function purchaseOrderGroupOpenState(
  states: readonly ('checking' | 'ready' | 'opened')[]
): 'checking' | 'ready' | 'opened' {
  if (states.some((state) => state === 'checking')) return 'checking';
  if (states.some((state) => state === 'opened')) return 'opened';
  return 'ready';
}

/** A mailto click is never cancelled. Nothing is logged until that click happens. */
export function purchaseOrderClickPlan(input: {
  alreadyOpened: boolean;
  clicked: boolean;
}): { preventDefault: false; log: false | { reopen: boolean } } {
  if (!input.clicked) return { preventDefault: false, log: false };
  return { preventDefault: false, log: { reopen: input.alreadyOpened } };
}

export type PurchaseOrderLogState = { notes: string[]; issues: string[] };

export type PurchaseOrderLogResult =
  | { network: true }
  | { status: number; error?: string; openedAt?: string };

/** A logged 409 keeps the first open time. Any other failure is an issue named for that supplier. */
export function applyPurchaseOrderLog(
  state: PurchaseOrderLogState,
  input: { supplier: string; grouped: boolean; result: PurchaseOrderLogResult }
): PurchaseOrderLogState {
  if ('network' in input.result) {
    return {
      notes: state.notes,
      issues: [...state.issues, `${input.supplier}: The order could not be recorded.`],
    };
  }
  const { status, error, openedAt } = input.result;
  if ((status === 409 || (status >= 200 && status < 300)) && openedAt) {
    const note = purchaseOrderOpenedWarning(openedAt);
    return {
      notes: [...state.notes, input.grouped ? `${input.supplier}: ${note}` : note],
      issues: state.issues,
    };
  }
  if (status === 409 || (status >= 200 && status < 300)) return state;
  const message = error?.trim() || 'The order could not be recorded.';
  return {
    notes: state.notes,
    issues: [...state.issues, `${input.supplier}: ${message}`],
  };
}

/** One line for group suppliers that have no email and so were not logged. */
export function purchaseOrderSkippedNoEmail(suppliers: readonly string[]): string | null {
  const names = suppliers
    .map((name) => name.replace(/[\r\n]+/g, ' ').trim())
    .filter(Boolean);
  if (names.length === 0) return null;
  return `Skipped, no email: ${names.join(', ')}`;
}

function composeHref(to: string, subject: string, body: string): { gmailUrl: string; mailtoUrl: string } {
  const encodedTo = encodeURIComponent(to);
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);
  return {
    gmailUrl: `https://mail.google.com/mail/?view=cm&fs=1&to=${encodedTo}&su=${encodedSubject}&body=${encodedBody}`,
    mailtoUrl: `mailto:${to}?subject=${encodedSubject}&body=${encodedBody}`,
  };
}

function mailHrefFits(to: string, subject: string, body: string): boolean {
  const hrefs = composeHref(to, subject, body);
  return hrefs.mailtoUrl.length <= MAILTO_URL_LIMIT && hrefs.gmailUrl.length <= GMAIL_COMPOSE_URL_LIMIT;
}

/** Shorten the body until the mailto URL fits. The note stays in the shortened text. */
export function fitPurchaseOrderBody(input: {
  to: string;
  subject: string;
  body: string;
}): { subject: string; body: string; truncated: boolean } {
  const to = singleSupplierEmail(input.to) ?? input.to.trim();
  if (mailHrefFits(to, input.subject, input.body)) {
    return { subject: input.subject, body: input.body, truncated: false };
  }
  let low = 0;
  let high = input.body.length;
  let best = ORDER_TRUNCATED_NOTE.trim();
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = `${input.body.slice(0, mid).trimEnd()}${ORDER_TRUNCATED_NOTE}`;
    if (mailHrefFits(to, input.subject, candidate)) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (mailHrefFits(to, input.subject, best)) {
    return { subject: input.subject, body: best, truncated: true };
  }
  const note = ORDER_TRUNCATED_NOTE.trim();
  low = 0;
  high = input.subject.length;
  let bestSubject = '';
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = input.subject.slice(0, mid).trimEnd();
    if (mailHrefFits(to, candidate, note)) {
      bestSubject = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return { subject: bestSubject, body: note, truncated: true };
}

export function purchaseOrderCompose(input: {
  to: string;
  subject: string;
  body: string;
}): { to: string; body: string; truncated: boolean; gmailUrl: string; mailtoUrl: string } | null {
  const to = singleSupplierEmail(input.to);
  if (!to) return null;
  const fitted = fitPurchaseOrderBody({ to, subject: input.subject, body: input.body });
  const hrefs = composeHref(to, fitted.subject, fitted.body);
  return { to, body: fitted.body, truncated: fitted.truncated, ...hrefs };
}

/** One heading per supplier, then that supplier's lines. Addresses stay out of the text. */
export function purchaseOrderGroupBody(
  drafts: readonly Pick<PoDraft, 'supplier' | 'body'>[]
): string {
  return drafts
    .map((draft) => {
      const heading = draft.supplier.replace(/[\r\n]+/g, ' ').trim();
      const lines = draft.body.replace(/\r\n/g, '\n').trim();
      if (!heading && !lines) return '';
      if (!lines) return heading;
      if (!heading) return lines;
      return `${heading}\n${lines}`;
    })
    .filter((section) => section.length > 0)
    .join('\n\n');
}

/** One mailto for every supplier. To stays empty so the buyer fills it in the mail app. */
export function purchaseOrderGroupCompose(
  drafts: readonly Pick<PoDraft, 'supplier' | 'body'>[]
): {
  to: '';
  subject: string;
  body: string;
  fullBody: string;
  truncated: boolean;
  mailtoUrl: string;
} | null {
  const fullBody = purchaseOrderGroupBody(drafts);
  if (!fullBody) return null;
  const fitted = fitPurchaseOrderBody({
    to: '',
    subject: PURCHASE_ORDER_GROUP_SUBJECT,
    body: fullBody,
  });
  return {
    to: '',
    subject: fitted.subject,
    body: fitted.body,
    fullBody,
    truncated: fitted.truncated,
    mailtoUrl: composeHref('', fitted.subject, fitted.body).mailtoUrl,
  };
}

export function purchaseOrderCopiedMessage(copied: boolean): string {
  return copied ? 'Full text copied.' : 'The full text could not be copied.';
}

export function purchaseOrderMailto(
  draft: Pick<PoDraft, 'to' | 'subject' | 'body'>
): string | null {
  return purchaseOrderCompose(draft)?.mailtoUrl ?? null;
}

/** Suppliers with one valid To address can be logged. Empty or invalid addresses are not. */
export function purchaseOrderSendPlan(drafts: readonly PoDraft[]): {
  ready: PoDraft[];
  skipped: PoDraft[];
} {
  const ready: PoDraft[] = [];
  const skipped: PoDraft[] = [];
  for (const draft of drafts) {
    if (singleSupplierEmail(draft.to)) ready.push(draft);
    else skipped.push(draft);
  }
  return { ready, skipped };
}

export function groupBySupplier(levels: StockLevel[]): Record<string, StockLevel[]> {
  const grouped: Record<string, StockLevel[]> = {};
  for (const row of levels) {
    const list = grouped[row.supplier] ?? [];
    list.push(row);
    grouped[row.supplier] = list;
  }
  for (const supplier of Object.keys(grouped)) {
    grouped[supplier].sort(
      (a, b) => Number(b.low) - Number(a.low) || a.name.localeCompare(b.name)
    );
  }
  return grouped;
}
