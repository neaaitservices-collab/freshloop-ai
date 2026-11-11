export interface RescueWindowDay {
  recovered: number;
  lost: number;
  rescueUnits: number;
  discardUnits: number;
}

export interface RescueWindowTotals {
  rescued: number;
  lost: number;
  rescueUnits: number;
  discardUnits: number;
  /** Null when rescued and lost are both zero. */
  rate: number | null;
}

export function rescueRatePct(rescued: number, lost: number): number | null {
  const handled = rescued + lost;
  if (!(handled > 0)) return null;
  return Number(((rescued / handled) * 100).toFixed(1));
}

export function rescueRateLabel(rate: number | null): string {
  if (rate === null) return '—';
  return `${rate.toFixed(1)}%`;
}

/** Sum a Toronto-day aggregate. An empty window is zero rescued, zero lost, and a dash rate. */
export function summarizeRescueWindow(days: readonly RescueWindowDay[]): RescueWindowTotals {
  let rescued = 0;
  let lost = 0;
  let rescueUnits = 0;
  let discardUnits = 0;
  for (const day of days) {
    rescued += day.recovered;
    lost += day.lost;
    rescueUnits += day.rescueUnits;
    discardUnits += day.discardUnits;
  }
  return {
    rescued,
    lost,
    rescueUnits,
    discardUnits,
    rate: rescueRatePct(rescued, lost),
  };
}
