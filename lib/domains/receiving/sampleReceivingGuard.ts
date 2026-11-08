import { SAMPLE_RECEIVING_LOGS } from '@/lib/domains/receiving/receivingSheet';

/** Shown by the API and the receiving screen. Not a stock movement. */
export const SAMPLE_RECEIVING_REJECTION =
  'Sample receiving data is a preview only and was not posted to inventory.';

/** Fixed id on the in-app “Use a sample invoice” fixture. */
export const DEMO_INVOICE_NUMBER = 'INV-2026-1020-TD';

export interface SampleReceivingLine {
  externalLogId?: string | null;
  itemName?: string | null;
  invoiceLineName?: string | null;
  casesReceived?: number | null;
  caseCost?: number | null;
  invoiceNumber?: string | null;
}

interface FixtureLine {
  itemName: string;
  casesReceived: number;
  caseCost: number;
}

/**
 * Practice invoice returned by `demo: true`. Costs are the per-case figures
 * the receiving board stores (`totalCost / quantity`, else `unitCost`).
 */
const SAMPLE_INVOICE_LINES: FixtureLine[] = [
  { itemName: 'Avocados Hass (Mexico)', casesReceived: 4, caseCost: 84.5 },
  { itemName: 'Hot House Tomatoes (Ontario)', casesReceived: 3, caseCost: 42 },
  { itemName: 'Honey Crisp Apples', casesReceived: 2, caseCost: 136 },
  { itemName: 'Whole Heavy Cream 40%', casesReceived: 5, caseCost: 15.6 },
  { itemName: 'Artisanal Sourdough Boule', casesReceived: 2, caseCost: 19.5 },
];

const FIXTURE_IDS = new Set(
  SAMPLE_RECEIVING_LOGS.map((row) => row.id.trim().toLowerCase())
);

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function costKey(value: number): string {
  return value.toFixed(2);
}

function fixtureKey(name: string, cases: number, cost: number): string {
  return `${normalizeName(name)}|${cases}|${costKey(cost)}`;
}

const FIXTURE_KEYS = new Set<string>([
  ...SAMPLE_RECEIVING_LOGS.map((row) =>
    fixtureKey(row.itemName, row.casesReceived, row.caseCost)
  ),
  ...SAMPLE_INVOICE_LINES.map((row) => fixtureKey(row.itemName, row.casesReceived, row.caseCost)),
]);

function matchesFixture(name: string | null | undefined, cases: number | null | undefined, cost: number | null | undefined): boolean {
  if (!name?.trim()) return false;
  if (typeof cases !== 'number' || !Number.isFinite(cases)) return false;
  if (typeof cost !== 'number' || !Number.isFinite(cost)) return false;
  return FIXTURE_KEYS.has(fixtureKey(name, cases, cost));
}

function idMarksSample(externalLogId: string | null | undefined): boolean {
  const id = externalLogId?.trim().toLowerCase() ?? '';
  if (!id) return false;
  if (FIXTURE_IDS.has(id)) return true;
  return id.includes(DEMO_INVOICE_NUMBER.toLowerCase());
}

/**
 * Identifiable demo fixtures only. A real receipt that does not use a sample
 * id, the demo invoice number, or an exact fixture name+qty+cost is allowed.
 * Returns the rejection message, or null when the line may post.
 */
export function sampleReceivingRejection(line: SampleReceivingLine): string | null {
  if (idMarksSample(line.externalLogId)) return SAMPLE_RECEIVING_REJECTION;
  const invoiceNumber = line.invoiceNumber?.trim().toLowerCase();
  if (invoiceNumber && invoiceNumber === DEMO_INVOICE_NUMBER.toLowerCase()) {
    return SAMPLE_RECEIVING_REJECTION;
  }
  if (matchesFixture(line.itemName, line.casesReceived, line.caseCost)) {
    return SAMPLE_RECEIVING_REJECTION;
  }
  if (matchesFixture(line.invoiceLineName, line.casesReceived, line.caseCost)) {
    return SAMPLE_RECEIVING_REJECTION;
  }
  return null;
}

export function sampleInvoiceCommitRejection(input: {
  vendorName?: string | null;
  invoiceNumber?: string | null;
  lines?: Array<{
    line_name?: string | null;
    itemName?: string | null;
    quantity?: number | null;
    unit_cost?: number | null;
    casesReceived?: number | null;
    caseCost?: number | null;
  }>;
}): string | null {
  if (sampleReceivingRejection({ invoiceNumber: input.invoiceNumber })) {
    return SAMPLE_RECEIVING_REJECTION;
  }
  for (const line of input.lines ?? []) {
    const cases = line.casesReceived ?? line.quantity;
    const cost = line.caseCost ?? line.unit_cost;
    const reason = sampleReceivingRejection({
      itemName: line.itemName ?? line.line_name,
      invoiceLineName: line.line_name,
      casesReceived: cases,
      caseCost: cost,
    });
    if (reason) return reason;
  }
  return null;
}
