export interface ReceivingBatchLineResult {
  externalLogId?: string;
  itemName: string;
  stock: {
    posted: boolean;
    reason?: string;
    onHand?: number;
    productId?: string;
    idempotent?: boolean;
    conflict?: boolean;
    unitsAdded?: number;
  };
}

/**
 * A 409 that still lists row results is a partial batch. The caller must apply
 * posted rows and show conflicts. A 409 without results is a failed request.
 */
export function interpretReceivingBatchResponse(
  status: number,
  body: { success?: boolean; error?: string; results?: ReceivingBatchLineResult[] } | null
): { apply: boolean; results: ReceivingBatchLineResult[]; error?: string } {
  const results = Array.isArray(body?.results) ? body.results : null;
  if (status === 409 && results) {
    return { apply: true, results, error: body?.error };
  }
  if (status !== 200 || body?.success !== true || !results) {
    return { apply: false, results: [], error: body?.error || 'Batch save failed.' };
  }
  return { apply: true, results };
}
