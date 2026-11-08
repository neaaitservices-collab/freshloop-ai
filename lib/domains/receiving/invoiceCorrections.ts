import type { InvoiceOcrResult } from '@/lib/types';

/** Edit buffer for one scan. Which fields are inputs is fixed when the scan arrives. */
export interface InvoiceCorrectionDraft {
  vendorText: string;
  invoiceText: string;
  editVendor: boolean;
  editInvoice: boolean;
  lines: Array<{
    nameText: string;
    quantityText: string;
    editName: boolean;
    editQuantity: boolean;
  }>;
  applied: boolean;
}

function needsNameEdit(name: string): boolean {
  const trimmed = name.trim();
  return !trimmed || trimmed.startsWith('Unread line ');
}

export function createCorrectionDraft(result: InvoiceOcrResult): InvoiceCorrectionDraft {
  const editVendor = !result.vendorName.trim();
  const editInvoice = !result.invoiceNumber.trim();
  const lines = result.lineItems.map((item) => ({
    nameText: item.name,
    quantityText: item.quantity > 0 ? String(item.quantity) : '',
    editName: needsNameEdit(item.name),
    editQuantity: !(item.quantity > 0),
  }));
  const needsEdits = editVendor || editInvoice || lines.some((line) => line.editName || line.editQuantity);
  return {
    vendorText: result.vendorName,
    invoiceText: result.invoiceNumber,
    editVendor,
    editInvoice,
    lines,
    applied: !needsEdits,
  };
}

export function patchCorrectionDraft(
  draft: InvoiceCorrectionDraft,
  patch: Partial<Pick<InvoiceCorrectionDraft, 'vendorText' | 'invoiceText'>> & {
    lineIndex?: number;
    nameText?: string;
    quantityText?: string;
  }
): InvoiceCorrectionDraft {
  const lines = draft.lines.map((line, index) => {
    if (index !== patch.lineIndex) return line;
    return {
      ...line,
      nameText: patch.nameText ?? line.nameText,
      quantityText: patch.quantityText ?? line.quantityText,
    };
  });
  return {
    ...draft,
    vendorText: patch.vendorText ?? draft.vendorText,
    invoiceText: patch.invoiceText ?? draft.invoiceText,
    lines,
    applied: false,
  };
}

export function applyCorrectionDraft(
  result: InvoiceOcrResult,
  draft: InvoiceCorrectionDraft
): { ok: true; result: InvoiceOcrResult; draft: InvoiceCorrectionDraft } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const vendorName = draft.editVendor ? draft.vendorText.trim() : result.vendorName.trim();
  const invoiceNumber = draft.editInvoice ? draft.invoiceText.trim() : result.invoiceNumber.trim();
  if (!vendorName) errors.push('Vendor name is required.');
  if (!invoiceNumber) errors.push('Invoice number is required.');
  const lineItems = result.lineItems.map((item, index) => {
    const edit = draft.lines[index];
    if (!edit) return item;
    let name = item.name;
    let quantity = item.quantity;
    if (edit.editName) {
      name = edit.nameText.trim();
      if (!name || name.startsWith('Unread line ')) {
        errors.push(`Line ${index + 1} needs a product name.`);
      }
    }
    if (edit.editQuantity) {
      const parsed = Number(edit.quantityText);
      if (!edit.quantityText.trim() || !Number.isFinite(parsed) || !(parsed > 0)) {
        errors.push(`Line ${index + 1} needs a quantity greater than zero.`);
      } else {
        quantity = parsed;
      }
    }
    return {
      ...item,
      name,
      quantity,
      totalCost: quantity > 0 ? Number((quantity * item.unitCost).toFixed(2)) : 0,
    };
  });
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    result: { ...result, vendorName, invoiceNumber, lineItems },
    draft: { ...draft, applied: true },
  };
}
