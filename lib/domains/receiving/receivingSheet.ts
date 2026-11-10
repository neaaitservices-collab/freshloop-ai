import {
  DELIVERY_ID_HEADERS,
  normalizeDeliveryUuid,
} from '@/lib/domains/receiving/deliveryIdentity';
import type { ReceivingLog } from '@/lib/domains/receiving/yieldPricing';

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
