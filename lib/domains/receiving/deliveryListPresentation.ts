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
