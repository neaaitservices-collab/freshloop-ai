export const PRODUCTION_INBOX_TITLE = 'From floor';
export const PRODUCTION_INBOX_EMPTY = 'Nothing came from the floor in this range.';

/** Inbox query. No date params means Today in Toronto (`preset=day`). */
export function productionInboxQuery(search: { get(name: string): string | null }): string {
  const params = new URLSearchParams();
  const preset = search.get('preset');
  const from = search.get('from');
  const to = search.get('to');
  if ((preset === 'day' || preset === 'week' || preset === 'month') && !from && !to) {
    params.set('preset', preset);
  } else if (from && to) {
    params.set('from', from);
    params.set('to', to);
  } else {
    params.set('preset', 'day');
  }
  return params.toString();
}
