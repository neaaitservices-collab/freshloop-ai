export type InvoiceHoldCode =
  | 'DATE_REQUIRED'
  | 'DATE_CONFLICT'
  | 'WHITESPACE_CONFLICT'
  | 'LEGACY_RECEIPT_PRESENT'
  | 'LINES_NEED_CONFIRMATION'
  | 'RENAME_AMBIGUOUS'
  | 'AMBIGUOUS_DOCUMENT'
  | 'SUPPLIER_REQUIRED'
  | 'SUPPLIER_UNKNOWN'
  | 'INVOICE_NUMBER_REQUIRED';

export interface InvoiceHoldAction {
  action:
    | 'link-date'
    | 'separate-document'
    | 'link-spelling'
    | 'separate-spelling'
    | 'add-lines'
    | 'map-line'
    | 'adopt-legacy';
  label: string;
}

/** Buttons the receiving screen may offer. A rename has no automatic add. */
export interface IdentityHoldState {
  code: string;
  error: string;
  newPrintedNames?: string[];
  storedDates?: string[];
  legacyReceipts?: { key: string; vendor: string; invoice: string }[];
  unmatchedStoredLines?: { id: string; printedKey: string }[];
}

/** A new scan must not keep the previous paper's date or confirmation buttons. */
export function clearedInvoiceIdentity(): { dateDraft: ''; identityHold: null } {
  return { dateDraft: '', identityHold: null };
}

export function identityHoldFromResponse(body: {
  success?: boolean;
  code?: string;
  error?: string;
  newPrintedNames?: string[];
  storedDates?: string[];
  legacyReceipts?: { key: string; vendor: string; invoice: string }[];
  unmatchedStoredLines?: { id: string; printedKey: string }[];
} | null): IdentityHoldState | null {
  if (!body || body.success) return null;
  if (!body.code && !body.error) return null;
  return {
    code: body.code ?? 'LINE_MISMATCH',
    error: body.error ?? 'This invoice needs a decision before it can be received.',
    newPrintedNames: body.newPrintedNames,
    storedDates: body.storedDates,
    legacyReceipts: body.legacyReceipts,
    unmatchedStoredLines: body.unmatchedStoredLines,
  };
}

/** Operations and Production stash the scan. Only a screen that offers the picker requires a supplier first. */
export function invoiceImportBlockedWithoutSupplier(options: {
  offersSupplierPicker: boolean;
  selectedSupplierId: string;
}): boolean {
  return options.offersSupplierPicker && options.selectedSupplierId.trim().length === 0;
}

export function invoiceHoldActions(code: string): InvoiceHoldAction[] {
  switch (code) {
    case 'DATE_CONFLICT':
      return [
        { action: 'link-date', label: 'Store manager: this is the same invoice' },
        { action: 'separate-document', label: 'This is a different dated delivery' },
      ];
    case 'WHITESPACE_CONFLICT':
      return [
        { action: 'link-spelling', label: 'Store manager: these are the same invoice number' },
        { action: 'separate-spelling', label: 'These are different invoice numbers' },
      ];
    case 'LINES_NEED_CONFIRMATION':
      return [{ action: 'add-lines', label: 'Add the missing printed lines' }];
    case 'LEGACY_RECEIPT_PRESENT':
      return [{ action: 'adopt-legacy', label: 'Store manager: attach this supplier’s earlier receipt without adding stock' }];
    case 'RENAME_AMBIGUOUS':
      return [{ action: 'map-line', label: 'Store manager: map this line onto the saved line' }];
    default:
      return [];
  }
}

export function describeBatchSaveOutcome(input: {
  savedCount: number;
  replayCount: number;
  failed: string[];
  targetCount: number;
}): { notice?: string; error?: string; savedMessage?: string } {
  if (input.savedCount > 0 && input.replayCount === input.savedCount && input.failed.length === 0) {
    return { notice: 'Those deliveries were already received. Stock was not added again.' };
  }
  if (input.savedCount > 0 && input.failed.length > 0) {
    return {
      notice: `Saved ${input.savedCount} of ${input.targetCount} items to inventory.`,
      error: `Still on the list: ${input.failed.join('; ')}`,
    };
  }
  if (input.savedCount > 1 && input.failed.length === 0) {
    return { notice: `Saved ${input.savedCount} items to inventory.` };
  }
  if (input.savedCount === 1 && input.failed.length === 0) {
    return { savedMessage: 'Saved to inventory.' };
  }
  if (input.failed.length > 0) {
    return { error: `Nothing saved. ${input.failed.join('; ')}` };
  }
  return { error: 'Nothing saved.' };
}

export function describeCommitRollback(input: {
  committed?: boolean;
  results?: { itemName?: string; stock?: { posted?: boolean; reason?: string; conflict?: boolean } }[];
}): { committed: false; summary: string; lines: string[] } {
  const lines = (input.results ?? []).map((row) => {
    const name = row.itemName || 'Line';
    return `${name}: ${row.stock?.reason || (row.stock?.posted ? 'posted' : 'not posted')}`;
  });
  return {
    committed: false,
    summary: 'This commit was rolled back. No new stock was added by this request.',
    lines,
  };
}
