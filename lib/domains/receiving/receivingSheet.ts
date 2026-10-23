import type { ReceivingLog } from '@/lib/domains/receiving/yieldPricing';

export const RECEIVING_SHEET_NAME = 'Receiving_logs';

export const SAMPLE_RECEIVING_LOGS: ReceivingLog[] = [
  { id: 'sample-avocado', itemName: 'Hass Avocados (Mexico)', casesReceived: 4, caseCost: 84.5 },
  { id: 'sample-tomato', itemName: 'Hot House Tomatoes (Ontario)', casesReceived: 3, caseCost: 42 },
  { id: 'sample-apple', itemName: 'Honeycrisp Apples', casesReceived: 2, caseCost: 136 },
  { id: 'sample-blueberry', itemName: 'Blueberries', casesReceived: 6, caseCost: 32.4 },
  { id: 'sample-strawberry', itemName: 'Strawberries', casesReceived: 5, caseCost: 27.5 },
];

const ITEM_HEADERS = new Set(['select item', 'item', 'item name', 'itemname', 'product']);
const COUNT_HEADERS = new Set([
  'new inventory count',
  'cases received',
  'casesreceived',
  'inventory count',
  'case count',
]);
const COST_HEADERS = new Set(['new case cost', 'case cost', 'casecost', 'cost']);

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value ?? '')
    .replace(/[$,]/g, '')
    .trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseReceivingSheetValues(values: unknown[][]): ReceivingLog[] {
  if (!Array.isArray(values) || values.length < 2) return [];

  const headers = (values[0] ?? []).map((cell) => normalizeHeader(String(cell ?? '')));
  const itemIndex = headers.findIndex((header) => ITEM_HEADERS.has(header));
  const countIndex = headers.findIndex((header) => COUNT_HEADERS.has(header));
  const costIndex = headers.findIndex((header) => COST_HEADERS.has(header));

  if (itemIndex < 0 || countIndex < 0 || costIndex < 0) return [];

  const logs: ReceivingLog[] = [];
  values.slice(1).forEach((row, index) => {
    const itemName = String(row?.[itemIndex] ?? '').trim();
    const casesReceived = parseNumber(row?.[countIndex]);
    const caseCost = parseNumber(row?.[costIndex]);
    if (!itemName || casesReceived === null || caseCost === null) return;
    if (casesReceived < 0 || caseCost < 0) return;
    logs.push({
      id: `sheet-row-${index + 2}`,
      itemName,
      casesReceived,
      caseCost,
    });
  });

  return logs;
}

export interface ReceivingLogsResult {
  success: boolean;
  source: 'google_sheets' | 'sample';
  sheetName: string;
  logs: ReceivingLog[];
  warning: string | null;
}

export async function loadReceivingLogs(): Promise<ReceivingLogsResult> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY?.trim();

  if (!spreadsheetId || !apiKey) {
    return {
      success: true,
      source: 'sample',
      sheetName: RECEIVING_SHEET_NAME,
      logs: SAMPLE_RECEIVING_LOGS,
      warning:
        'GOOGLE_SHEETS_SPREADSHEET_ID or GOOGLE_SHEETS_API_KEY is not set. Showing sample Receiving_logs.',
    };
  }

  const range = encodeURIComponent(RECEIVING_SHEET_NAME);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${apiKey}`;

  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      const detail = await response.text();
      return {
        success: true,
        source: 'sample',
        sheetName: RECEIVING_SHEET_NAME,
        logs: SAMPLE_RECEIVING_LOGS,
        warning: `Google Sheets returned ${response.status}. Showing sample Receiving_logs. ${detail.slice(0, 180)}`,
      };
    }

    const payload = (await response.json()) as { values?: unknown[][] };
    const logs = parseReceivingSheetValues(payload.values ?? []);
    if (logs.length === 0) {
      return {
        success: true,
        source: 'google_sheets',
        sheetName: RECEIVING_SHEET_NAME,
        logs: [],
        warning:
          'Receiving_logs was found, but no rows matched Select Item, New Inventory Count, and New Case Cost.',
      };
    }

    return {
      success: true,
      source: 'google_sheets',
      sheetName: RECEIVING_SHEET_NAME,
      logs,
      warning: null,
    };
  } catch (error) {
    return {
      success: true,
      source: 'sample',
      sheetName: RECEIVING_SHEET_NAME,
      logs: SAMPLE_RECEIVING_LOGS,
      warning:
        error instanceof Error
          ? `Could not reach Google Sheets (${error.message}). Showing sample Receiving_logs.`
          : 'Could not reach Google Sheets. Showing sample Receiving_logs.',
    };
  }
}
