import {
  DELIVERY_ID_HEADERS,
  normalizeDeliveryUuid,
} from '@/lib/domains/receiving/deliveryIdentity';
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

export const MISSING_DELIVERY_ID_WARNING =
  'Some receiving rows cannot be posted. Each delivery needs its own UUID in Delivery ID, Line ID, or External ID. A repeated UUID blocks every row that uses it. FreshLoop only reads the sheet.';

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
  const idIndex = headers.findIndex((header) => DELIVERY_ID_HEADERS.has(header));

  if (itemIndex < 0 || countIndex < 0 || costIndex < 0) return [];

  const draft: Array<{
    index: number;
    itemName: string;
    casesReceived: number;
    caseCost: number;
    deliveryId: string | null;
  }> = [];
  values.slice(1).forEach((row, index) => {
    const itemName = String(row?.[itemIndex] ?? '').trim();
    const casesReceived = parseNumber(row?.[countIndex]);
    const caseCost = parseNumber(row?.[costIndex]);
    if (!itemName || casesReceived === null || caseCost === null) return;
    if (casesReceived < 0 || caseCost < 0) return;
    const rawId = idIndex >= 0 ? String(row?.[idIndex] ?? '').trim() : '';
    draft.push({
      index,
      itemName,
      casesReceived,
      caseCost,
      deliveryId: normalizeDeliveryUuid(rawId),
    });
  });
  const idCount = new Map<string, number>();
  for (const row of draft) {
    if (!row.deliveryId) continue;
    idCount.set(row.deliveryId, (idCount.get(row.deliveryId) ?? 0) + 1);
  }

  const logs: ReceivingLog[] = [];
  for (const row of draft) {
    const duplicated = Boolean(row.deliveryId && (idCount.get(row.deliveryId) ?? 0) > 1);
    const canPost = Boolean(row.deliveryId) && !duplicated;
    logs.push({
      id: canPost && row.deliveryId ? row.deliveryId : `unassigned-sheet-row-${row.index + 2}`,
      itemName: row.itemName,
      casesReceived: row.casesReceived,
      caseCost: row.caseCost,
      canPost,
    });
  }

  return logs;
}

export type ReceivingLogSource = 'google_sheets' | 'unconfigured' | 'unavailable';

export interface ReceivingLogsResult {
  success: boolean;
  source: ReceivingLogSource;
  sheetName: string;
  logs: ReceivingLog[];
  warning: string | null;
}

/** Sheet is not configured. Sample fixture rows are not returned. */
export function unconfiguredReceivingLogs(): ReceivingLogsResult {
  return {
    success: true,
    source: 'unconfigured',
    sheetName: RECEIVING_SHEET_NAME,
    logs: [],
    warning:
      'The receiving sheet is not connected. Sample rows are not shown and cannot be saved as inventory.',
  };
}

/** Sheet was configured but could not be read. Sample rows are not substituted. */
export function unavailableReceivingLogs(detail: string): ReceivingLogsResult {
  return {
    success: true,
    source: 'unavailable',
    sheetName: RECEIVING_SHEET_NAME,
    logs: [],
    warning: `The receiving sheet could not be read. Nothing was substituted. ${detail}`.slice(0, 280),
  };
}

export async function loadReceivingLogs(deps?: {
  fetch?: typeof fetch;
}): Promise<ReceivingLogsResult> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY?.trim();
  const fetchImpl = deps?.fetch ?? fetch;

  if (!spreadsheetId || !apiKey) {
    return unconfiguredReceivingLogs();
  }

  const range = encodeURIComponent(RECEIVING_SHEET_NAME);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${apiKey}`;

  try {
    const response = await fetchImpl(url, { cache: 'no-store' });
    if (!response.ok) {
      const detail = await response.text();
      return unavailableReceivingLogs(
        `Google Sheets returned ${response.status}. ${detail.slice(0, 160)}`
      );
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

    const missingIdentity = logs.some((log) => log.canPost === false);
    return {
      success: true,
      source: 'google_sheets',
      sheetName: RECEIVING_SHEET_NAME,
      logs,
      warning: missingIdentity ? MISSING_DELIVERY_ID_WARNING : null,
    };
  } catch (error) {
    return unavailableReceivingLogs(
      error instanceof Error
        ? `Could not reach Google Sheets (${error.message}).`
        : 'Could not reach Google Sheets.'
    );
  }
}
