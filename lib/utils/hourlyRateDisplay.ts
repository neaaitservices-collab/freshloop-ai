const DEFAULT_HOURLY = 17.6;

export function formatHourlyRate(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return '—';
  return `$${rate.toFixed(2)}/hr`;
}

/** Parse modal text input to a positive hourly rate, or null if invalid. */
export function parseHourlyRateInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0 || n > 10_000) return null;
  return Number(n.toFixed(2));
}

export function hourlyRateInputString(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) {
    return String(DEFAULT_HOURLY);
  }
  return rate.toFixed(2);
}

export { DEFAULT_HOURLY };
