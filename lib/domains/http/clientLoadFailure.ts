export const RECIPE_LOAD_ERROR = 'Recipes could not be loaded.';
export const RECIPE_LOAD_NETWORK_ERROR =
  'Recipes could not be loaded. The connection failed.';
export const STOCK_REFRESH_ERROR = 'Stock could not be refreshed.';
export const STOCK_REFRESH_NETWORK_ERROR =
  'Stock could not be refreshed. The connection failed.';
export const STAFF_ROSTER_LOAD_ERROR = 'The staff roster could not be loaded.';

export function messageFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const error = (body as { error?: unknown }).error;
  return typeof error === 'string' && error.trim() ? error.trim() : null;
}

/** Null when the response is a successful list. Otherwise an error to show. */
export function listLoadFailure(
  responseOk: boolean,
  body: unknown,
  listKey: string,
  fallback: string
): string | null {
  if (responseOk && body && typeof body === 'object') {
    const json = body as { success?: unknown } & Record<string, unknown>;
    if (json.success === true && Array.isArray(json[listKey])) return null;
  }
  return messageFromBody(body) ?? fallback;
}
