/**
 * What the receive screen shows for the delivery list.
 * A positive row count always wins. Otherwise the screen is loading, an error, or empty — never blank.
 */
export type DeliveryListPresentation = 'rows' | 'loading' | 'error' | 'empty';

export function deliveryListPresentation(input: {
  rowCount: number;
  loading: boolean;
  warning: string | null | undefined;
}): DeliveryListPresentation {
  if (input.rowCount > 0) return 'rows';
  const warning = input.warning?.trim() ?? '';
  if (warning) return 'error';
  if (input.loading) return 'loading';
  return 'empty';
}

/** Shown when Receive has no invoice open. Every delivery has to come through an invoice. */
export const SCAN_OR_OPEN_INVOICE_TO_RECEIVE = 'Scan or open an invoice to receive';

export function receiveInvoiceGate(invoiceOpen: boolean): {
  emptyMessage: string | null;
  saveAvailable: boolean;
} {
  if (invoiceOpen) return { emptyMessage: null, saveAvailable: true };
  return { emptyMessage: SCAN_OR_OPEN_INVOICE_TO_RECEIVE, saveAvailable: false };
}
