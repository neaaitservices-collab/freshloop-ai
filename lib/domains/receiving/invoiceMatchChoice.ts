export interface InvoiceMatchChoice {
  productId?: string;
  productName?: string;
  productPicked?: boolean;
  remember?: boolean;
  unlink?: boolean;
  createNew?: boolean;
  pickerOpen?: boolean;
}

export interface InvoiceMatchResolutionLine {
  index: number;
  product_id?: string;
  remember?: boolean;
  unlink?: boolean;
  create_new?: boolean;
}

/** Clerk picks sent with a receive save. Blank product ids are left off. */
export function invoiceMatchResolutions(
  logs: ReadonlyArray<{ id: string; draftLineIndex?: number }>,
  choices: Readonly<Record<string, InvoiceMatchChoice | undefined>>,
  supplierSaved: boolean
): { lines: InvoiceMatchResolutionLine[] } | undefined {
  const lines: InvoiceMatchResolutionLine[] = [];
  for (const log of logs) {
    if (typeof log.draftLineIndex !== 'number') continue;
    const choice = choices[log.id];
    if (!choice) continue;
    const productId = choice.productId?.trim() ?? '';
    const picked = choice.productPicked === true && Boolean(productId);
    const unlink = choice.unlink === true;
    const createNew = choice.createNew === true && !picked;
    if (!picked && !unlink && !createNew) continue;
    lines.push({
      index: log.draftLineIndex,
      ...(picked ? { product_id: productId } : {}),
      ...(picked ? { remember: supplierSaved && choice.remember !== false } : {}),
      ...(unlink ? { unlink: true } : {}),
      ...(createNew ? { create_new: true } : {}),
    });
  }
  return lines.length > 0 ? { lines } : undefined;
}
