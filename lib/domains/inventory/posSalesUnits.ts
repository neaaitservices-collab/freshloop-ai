/** POS sold lookback for transfer list pills (ledger Sale + POS_Sale). */

export function parsePosSalesDaysParam(raw: string | null, fallback = 7): number {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return fallback;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(90, Math.max(1, Math.floor(n)));
}

export function posSalesWindowStart(lookbackDays: number): Date {
  const days = parsePosSalesDaysParam(String(lookbackDays), 7);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}
