/** In-stock levels for transfer screens. POS sales are not part of this payload. */
export const IN_STOCK_LEVELS_PATH = '/api/inventory/levels?inStockOnly=1';

const LEVELS_LOAD_ERROR = 'Live stock levels could not be loaded.';

export function interpretInventoryLevelsBody(
  responseOk: boolean,
  body: unknown
): { levels: unknown[] } | { error: string } {
  const record =
    body && typeof body === 'object'
      ? (body as { success?: unknown; levels?: unknown; error?: unknown })
      : null;
  if (responseOk && record?.success === true && Array.isArray(record.levels)) {
    return { levels: record.levels };
  }
  const message =
    record && typeof record.error === 'string' && record.error.trim()
      ? record.error.trim()
      : LEVELS_LOAD_ERROR;
  return { error: message };
}
