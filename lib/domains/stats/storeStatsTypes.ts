export interface RescueSlice {
  name: string;
  units: number;
}

export interface RevenueDay {
  label: string;
  lost: number;
  recovered: number;
}

/** One calendar day of floor rescue vs discard (ledger-backed). */
export interface RescueOutcomeDay {
  label: string;
  /** Retail $ sent to kitchen (Rescue → Kitchen_Prep). */
  recoveredUsd: number;
  /** Retail $ lost to floor waste (excludes volumetric scrap). */
  lostUsd: number;
  rescueUnits: number;
  discardUnits: number;
}

export interface DepartmentAlert {
  department: string;
  low: number;
  expiring: number;
}

export interface StoreStats {
  rescuedValue: number;
  /** 30-day retail $ lost to floor discard (excludes volumetric scrap). */
  lostValue: number;
  expiringWithin48h: number;
  inventoryValue: number;
  wasteReductionPct: number | null;
  wastePct: number | null;
  /** Discard COGS + volumetric scrap $ (ledger numerator). */
  totalWasteValue: number;
  /** POS / sale revenue denominator for waste %. */
  grossSalesRevenue: number;
  targetWastePct: number;
  /** Store setting: days-to-expiry window used for the pulls count. */
  pullSensitivityDays: number;
  pulls: number;
  /** In-stock SKUs strictly under par. Matches the orders "below par" count. */
  lowCount: number;
  /** Empty shelf on the same catalog. Not included in lowCount. */
  outOfStockCount: number;
  /** Vendor credits / invoice dispositions awaiting manager review. */
  pendingApprovalsCount: number;
  rescueVsDiscard: RescueSlice[];
  revenueDays: RevenueDay[];
  /** Last 7 days — single source for rescue/discard chart (units + retail $). */
  outcomeDays: RescueOutcomeDay[];
  departmentAlerts: DepartmentAlert[];
  /** Toronto dates for the production-transfer chart. Null keeps the default 7-day window. */
  transferRangeLabel: string | null;
}
