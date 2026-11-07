import { rememberLedgerRead } from '@/lib/domains/inventory/ledgerCache';
import { getStockLevelsWithPosSales, type StockLevel } from '@/lib/domains/inventory/stock';
import { normalizeParCases, stockFromPar } from '@/lib/domains/inventory/parLevel';

/** Default POS lookback for velocity (days). */
export const DEFAULT_VELOCITY_LOOKBACK_DAYS = 7;

/** Days from PO send to shelf (until supplier-specific lead times exist). */
export const DEFAULT_LEAD_TIME_DAYS = 2;

/** Extra shelf cushion beyond lead-time consumption when sizing orders. */
export const DEFAULT_SAFETY_STOCK_DAYS = 1;

/** Rolling week target when inferring dynamic par from consumption. */
export const DEFAULT_PAR_COVERAGE_DAYS = 7;

const MIN_DAILY_VELOCITY = 0.25;

/** Grocery-style demand shape (Mon=1 … Sun=7). */
export const DEFAULT_DOW_MULTIPLIERS: Readonly<Record<number, number>> = {
  0: 1.12, // Sunday
  1: 0.92,
  2: 0.96,
  3: 1.0,
  4: 1.04,
  5: 1.14,
  6: 1.18, // Saturday
};

export interface BuyForecastHooks {
  /** Multiplier applied on top of velocity (e.g. summer produce bump). */
  seasonalFactor?: number;
  /** Override default rolling DOW multipliers. */
  dayOfWeekMultipliers?: Readonly<Record<number, number>>;
}

export interface BuyForecastConfig {
  velocityLookbackDays: number;
  leadTimeDays: number;
  safetyStockDays: number;
  parCoverageDays: number;
  hooks: BuyForecastHooks;
}

export const DEFAULT_BUY_FORECAST_CONFIG: BuyForecastConfig = {
  velocityLookbackDays: DEFAULT_VELOCITY_LOOKBACK_DAYS,
  leadTimeDays: DEFAULT_LEAD_TIME_DAYS,
  safetyStockDays: DEFAULT_SAFETY_STOCK_DAYS,
  parCoverageDays: DEFAULT_PAR_COVERAGE_DAYS,
  hooks: {},
};

export type BuyForecastConfigInput = Partial<BuyForecastConfig> & {
  hooks?: Partial<BuyForecastHooks>;
};

export function resolveBuyForecastConfig(partial?: BuyForecastConfigInput): BuyForecastConfig {
  const base = DEFAULT_BUY_FORECAST_CONFIG;
  const hooks = partial?.hooks;
  return {
    velocityLookbackDays: partial?.velocityLookbackDays ?? base.velocityLookbackDays,
    leadTimeDays: partial?.leadTimeDays ?? base.leadTimeDays,
    safetyStockDays: partial?.safetyStockDays ?? base.safetyStockDays,
    parCoverageDays: partial?.parCoverageDays ?? base.parCoverageDays,
    hooks: {
      seasonalFactor: hooks?.seasonalFactor ?? 1,
      dayOfWeekMultipliers: hooks?.dayOfWeekMultipliers ?? DEFAULT_DOW_MULTIPLIERS,
    },
  };
}

export function dailyVelocityUnits(soldInWindow: number, lookbackDays: number): number {
  const days = Math.max(1, Math.floor(lookbackDays));
  const sold = Math.max(0, Number(soldInWindow));
  if (!Number.isFinite(sold)) return 0;
  return sold / days;
}

export function dayOfWeekMultiplier(
  date: Date,
  profile: Readonly<Record<number, number>> = DEFAULT_DOW_MULTIPLIERS
): number {
  const dow = date.getDay();
  const mult = profile[dow];
  return mult && mult > 0 ? mult : 1;
}

export function averageWindowMultiplier(
  start: Date,
  spanDays: number,
  profile: Readonly<Record<number, number>> = DEFAULT_DOW_MULTIPLIERS
): number {
  if (spanDays <= 0) return 1;
  let sum = 0;
  const cursor = new Date(start);
  cursor.setHours(12, 0, 0, 0);
  for (let i = 0; i < spanDays; i += 1) {
    sum += dayOfWeekMultiplier(cursor, profile);
    cursor.setDate(cursor.getDate() + 1);
  }
  return sum / spanDays;
}

export function projectedDemandUnits(input: {
  dailyVelocity: number;
  leadTimeDays: number;
  safetyStockDays: number;
  startDate: Date;
  seasonalFactor?: number;
  dayOfWeekMultipliers?: Readonly<Record<number, number>>;
}): number {
  const daily = Math.max(0, input.dailyVelocity);
  const span = Math.max(0, input.leadTimeDays + input.safetyStockDays);
  if (daily <= 0 || span <= 0) return 0;
  const profile = input.dayOfWeekMultipliers ?? DEFAULT_DOW_MULTIPLIERS;
  const seasonal = input.seasonalFactor && input.seasonalFactor > 0 ? input.seasonalFactor : 1;
  let total = 0;
  const cursor = new Date(input.startDate);
  cursor.setHours(12, 0, 0, 0);
  for (let i = 0; i < span; i += 1) {
    total += daily * dayOfWeekMultiplier(cursor, profile) * seasonal;
    cursor.setDate(cursor.getDate() + 1);
  }
  return Number(total.toFixed(4));
}

export function suggestDynamicParCases(input: {
  dailyVelocity: number;
  casePackSize: number;
  parCoverageDays: number;
  seasonalFactor?: number;
  currentParCases: number;
}): number | null {
  const pack = input.casePackSize > 0 ? input.casePackSize : 1;
  const daily = input.dailyVelocity;
  if (daily < MIN_DAILY_VELOCITY) return null;
  const seasonal = input.seasonalFactor && input.seasonalFactor > 0 ? input.seasonalFactor : 1;
  const targetUnits = daily * input.parCoverageDays * seasonal;
  const inferred = Math.ceil(targetUnits / pack);
  const normalized = normalizeParCases(inferred);
  const current = normalizeParCases(input.currentParCases);
  return Math.max(normalized, current);
}

export function buildForecastRationale(input: {
  lookbackDays: number;
  dailyVelocity: number;
  leadTimeDays: number;
  windowMultiplier: number;
  usedWeekendBoost: boolean;
}): string {
  const vel = input.dailyVelocity.toFixed(1);
  const parts = [
    `Suggested based on ${input.lookbackDays}-day velocity (${vel} u/day)`,
  ];
  if (input.usedWeekendBoost || input.windowMultiplier > 1.02) {
    parts.push(`+ weekend multiplier ×${input.windowMultiplier.toFixed(2)}`);
  }
  if (input.leadTimeDays > 0) {
    parts.push(`${input.leadTimeDays}-day lead`);
  }
  return parts.join(' · ');
}

export interface BuyForecastLineResult {
  orderCases: number;
  orderCost: number;
  low: boolean;
  parCases: number;
  parUnits: number;
  onHandCases: number;
  forecastRationale: string;
  forecastDailyVelocity: number | null;
  suggestedParCases: number | null;
  forecastDriven: boolean;
}

export function computeBuyForecastLine(
  row: StockLevel,
  config: BuyForecastConfig,
  now: Date = new Date()
): BuyForecastLineResult {
  const casePackSize = row.casePackSize > 0 ? row.casePackSize : 1;
  const unitCost = row.unitCost > 0 ? row.unitCost : 0;
  const lookback = row.posSalesDays ?? config.velocityLookbackDays;
  const sold = row.posSoldInWindow ?? 0;
  const daily = dailyVelocityUnits(sold, lookback);
  const parBase = stockFromPar({
    onHand: row.onHand,
    casePackSize,
    unitCost,
    parCases: row.parCases,
  });

  const profile = config.hooks.dayOfWeekMultipliers ?? DEFAULT_DOW_MULTIPLIERS;
  const seasonal = config.hooks.seasonalFactor ?? 1;

  if (daily < MIN_DAILY_VELOCITY) {
    return {
      ...parBase,
      forecastRationale: '',
      forecastDailyVelocity: null,
      suggestedParCases: null,
      forecastDriven: false,
    };
  }

  const suggestedPar = suggestDynamicParCases({
    dailyVelocity: daily,
    casePackSize,
    parCoverageDays: config.parCoverageDays,
    seasonalFactor: seasonal,
    currentParCases: row.parCases,
  });

  const dynamicParUnits =
    normalizeParCases(suggestedPar ?? row.parCases) * casePackSize;
  const shelfTargetUnits = Math.max(parBase.parUnits, dynamicParUnits);

  const leadDemand = projectedDemandUnits({
    dailyVelocity: daily,
    leadTimeDays: config.leadTimeDays,
    safetyStockDays: config.safetyStockDays,
    startDate: now,
    seasonalFactor: seasonal,
    dayOfWeekMultipliers: profile,
  });

  const targetUnits = shelfTargetUnits + leadDemand;
  const shortfallUnits = targetUnits - row.onHand;
  const forecastOrderCases =
    shortfallUnits > 0.01 ? Math.max(1, Math.ceil(shortfallUnits / casePackSize)) : 0;

  const orderCases = Math.max(parBase.orderCases, forecastOrderCases);
  const low = orderCases > 0 || parBase.low;
  const orderCost = Number((orderCases * casePackSize * unitCost).toFixed(2));

  const windowMult = averageWindowMultiplier(
    now,
    config.leadTimeDays + config.safetyStockDays,
    profile
  );
  const weekendBoost =
    windowMult > 1.05 &&
    (now.getDay() === 5 || now.getDay() === 6 || now.getDay() === 0);

  const forecastRationale = buildForecastRationale({
    lookbackDays: lookback,
    dailyVelocity: daily,
    leadTimeDays: config.leadTimeDays,
    windowMultiplier: windowMult,
    usedWeekendBoost: weekendBoost,
  });

  return {
    parCases: parBase.parCases,
    parUnits: parBase.parUnits,
    onHandCases: parBase.onHandCases,
    low,
    orderCases,
    orderCost,
    forecastRationale,
    forecastDailyVelocity: Number(daily.toFixed(4)),
    suggestedParCases: suggestedPar,
    forecastDriven: orderCases > parBase.orderCases || (low && !parBase.low),
  };
}

export function applyBuyForecastToLevel(
  row: StockLevel,
  config: BuyForecastConfig = DEFAULT_BUY_FORECAST_CONFIG,
  now?: Date
): StockLevel {
  const forecast = computeBuyForecastLine(row, config, now);
  return {
    ...row,
    parCases: forecast.parCases,
    parUnits: forecast.parUnits,
    onHandCases: forecast.onHandCases,
    low: forecast.low,
    orderCases: forecast.orderCases,
    orderCost: forecast.orderCost,
    forecastRationale: forecast.forecastRationale || undefined,
    forecastDailyVelocity: forecast.forecastDailyVelocity ?? undefined,
    suggestedParCases: forecast.suggestedParCases ?? undefined,
    forecastDriven: forecast.forecastDriven || undefined,
  };
}

export function applyBuyForecastBatch(
  levels: StockLevel[],
  config: BuyForecastConfig = DEFAULT_BUY_FORECAST_CONFIG,
  now?: Date
): StockLevel[] {
  return levels.map((row) => applyBuyForecastToLevel(row, config, now));
}

const BUY_LIST_CACHE_MS = 60_000;
const buyListCache = new Map<
  string,
  { at: number; gen: number; value: Promise<StockLevel[]> }
>();

async function loadBuyListLevelsWithForecast(
  partialConfig?: Partial<BuyForecastConfig> & { hooks?: Partial<BuyForecastHooks> }
): Promise<StockLevel[]> {
  const config = resolveBuyForecastConfig(partialConfig);
  const levels = await getStockLevelsWithPosSales(config.velocityLookbackDays);
  const forecasted = applyBuyForecastBatch(levels, config);
  return forecasted.sort(
    (a, b) =>
      Number(b.low) - Number(a.low) ||
      Number(b.forecastDriven) - Number(a.forecastDriven) ||
      a.supplier.localeCompare(b.supplier) ||
      a.name.localeCompare(b.name)
  );
}

function buyListCacheKey(
  partialConfig?: Partial<BuyForecastConfig> & { hooks?: Partial<BuyForecastHooks> }
): string {
  const config = resolveBuyForecastConfig(partialConfig);
  const seasonal = config.hooks.seasonalFactor ?? 1;
  return `buy-${config.velocityLookbackDays}-${config.leadTimeDays}-${config.safetyStockDays}-${seasonal}`;
}

/** POS-enriched levels + in-memory forecast (cached per config fingerprint). */
export function getBuyListLevelsWithForecast(
  partialConfig?: Partial<BuyForecastConfig> & { hooks?: Partial<BuyForecastHooks> }
): Promise<StockLevel[]> {
  if (partialConfig) {
    return loadBuyListLevelsWithForecast(partialConfig);
  }
  return rememberLedgerRead(
    buyListCache,
    buyListCacheKey(partialConfig),
    BUY_LIST_CACHE_MS,
    () => loadBuyListLevelsWithForecast(partialConfig)
  );
}
