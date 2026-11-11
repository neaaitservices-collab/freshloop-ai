/**
 * Match a printed invoice vendor to a saved supplier.
 * Comparison ignores case, punctuation, and trailing legal suffixes.
 * This module never writes a supplier.
 */

const LEGAL_SUFFIXES = new Set([
  'ltd',
  'limited',
  'co',
  'company',
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'llc',
]);

/** Select value for "Add the printed name as a new supplier". Creation happens on save. */
export const ADD_OCR_SUPPLIER_VALUE = '__add_ocr_supplier__';

export interface SupplierNameCandidate {
  id: string;
  name: string;
}

export type SupplierNameMatch =
  | { status: 'matched'; supplier: SupplierNameCandidate }
  | { status: 'none' };

export type SupplierInvoiceSavePlan =
  | { action: 'link'; supplierId: string }
  | { action: 'create'; name: string }
  | { action: 'blocked' };

export function printedSupplierName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function nameTokens(name: string): string[] {
  const raw = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const tokens: string[] = [];
  let initials = '';
  const flushInitials = () => {
    if (!initials) return;
    tokens.push(initials);
    initials = '';
  };
  for (const token of raw) {
    if (token.length === 1) {
      initials += token;
      continue;
    }
    flushInitials();
    tokens.push(token);
  }
  flushInitials();
  return tokens;
}

function withoutLegalSuffixes(tokens: string[]): string[] {
  const next = [...tokens];
  while (next.length > 1 && LEGAL_SUFFIXES.has(next[next.length - 1] ?? '')) {
    next.pop();
  }
  return next;
}

/** Case and punctuation folded. Suffixes stay so an exact company can win over a different suffix. */
export function supplierNameKey(name: string): string {
  return nameTokens(name).join(' ');
}

/** Same key with trailing Ltd / Co. / Inc / Corp / LLC (and the spelled-out forms) removed. */
export function supplierNameLooseKey(name: string): string {
  return withoutLegalSuffixes(nameTokens(name)).join(' ');
}

function uniqueMatch(
  suppliers: readonly SupplierNameCandidate[],
  key: string,
  keyOf: (name: string) => string
): SupplierNameCandidate[] {
  if (!key) return [];
  return suppliers.filter((supplier) => keyOf(supplier.name) === key);
}

/**
 * One saved supplier whose name matches the printed vendor.
 * An exact punctuation-insensitive name wins over a different legal suffix.
 * Two equally good rows are not a match — the clerk has to choose.
 */
export function matchSupplierByName(
  ocrName: string,
  suppliers: readonly SupplierNameCandidate[]
): SupplierNameMatch {
  const exact = uniqueMatch(suppliers, supplierNameKey(ocrName), supplierNameKey);
  if (exact.length === 1) return { status: 'matched', supplier: exact[0]! };
  if (exact.length > 1) return { status: 'none' };

  const loose = uniqueMatch(suppliers, supplierNameLooseKey(ocrName), supplierNameLooseKey);
  if (loose.length === 1) return { status: 'matched', supplier: loose[0]! };
  return { status: 'none' };
}

/** Label for the explicit create option. Null when the scan has no vendor name. */
export function addOcrSupplierLabel(ocrName: string): string | null {
  const name = printedSupplierName(ocrName);
  if (!name) return null;
  return `Add "${name}" as new supplier`;
}

/**
 * What save does with the clerk's pick.
 * An empty pick does not create a supplier. Add-new creates only that printed name.
 */
export function supplierInvoiceSavePlan(input: {
  ocrName: string;
  selectedSupplierId: string;
}): SupplierInvoiceSavePlan {
  if (input.selectedSupplierId === ADD_OCR_SUPPLIER_VALUE) {
    const name = printedSupplierName(input.ocrName);
    if (!name) return { action: 'blocked' };
    return { action: 'create', name };
  }
  const supplierId = input.selectedSupplierId.trim();
  if (!supplierId) return { action: 'blocked' };
  return { action: 'link', supplierId };
}
