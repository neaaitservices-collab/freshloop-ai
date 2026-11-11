export interface ParsedInvoiceIdentity {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  gaps: string[];
}

export interface ParsedInvoiceLineFields {
  name: string;
  department: 'PRODUCE' | 'DAIRY' | 'BAKERY' | 'PANTRY' | 'DELI_KITCHEN';
  quantity: number;
  unit: string;
  departmentAssumed: boolean;
  quantityUnreadable: boolean;
  gaps: string[];
}

const DEPARTMENTS = ['PRODUCE', 'DAIRY', 'BAKERY', 'PANTRY', 'DELI_KITCHEN'] as const;

/** Keep a missing invoice identity blank. Do not mint a number or a vendor. */
export function parseInvoiceIdentity(raw: {
  vendorName?: unknown;
  invoiceNumber?: unknown;
  invoiceDate?: unknown;
}): ParsedInvoiceIdentity {
  const vendorName = String(raw.vendorName ?? '').trim();
  const invoiceNumber = String(raw.invoiceNumber ?? '').trim();
  const invoiceDate = String(raw.invoiceDate ?? '').trim();
  const gaps: string[] = [];
  if (!vendorName) gaps.push('Vendor name was not read.');
  if (!invoiceNumber) gaps.push('Invoice number was not read.');
  if (!invoiceDate) gaps.push('Invoice date was not read.');
  return {
    vendorName,
    invoiceNumber,
    invoiceDate,
    gaps,
  };
}

/**
 * A missing quantity stays 0 so receiving cannot post an invented case.
 * An unknown department is flagged. PRODUCE is only the placeholder until a clerk or a name signal chooses one.
 */
export function parseInvoiceLineFields(
  raw: Record<string, unknown>,
  lineNumber: number
): ParsedInvoiceLineFields {
  const gaps: string[] = [];
  const rawName = String(raw.name ?? raw.item_name ?? '').trim();
  const name = rawName || `Unread line ${lineNumber}`;
  if (!rawName) gaps.push(`Line ${lineNumber} has no product name.`);

  const departmentRaw = String(raw.department ?? '').trim();
  const departmentAssumed = !DEPARTMENTS.includes(departmentRaw as (typeof DEPARTMENTS)[number]);
  const department = departmentAssumed
    ? 'PRODUCE'
    : (departmentRaw as ParsedInvoiceLineFields['department']);
  if (departmentAssumed) gaps.push(`Line ${lineNumber} department was not read.`);

  const parsedQty = Number(raw.quantity);
  const quantityUnreadable = !(Number.isFinite(parsedQty) && parsedQty > 0);
  const quantity = quantityUnreadable ? 0 : parsedQty;
  if (quantityUnreadable) gaps.push(`Line ${lineNumber} quantity was not read.`);

  const unit = String(raw.unit || 'cases');
  return { name, department, quantity, unit, departmentAssumed, quantityUnreadable, gaps };
}
