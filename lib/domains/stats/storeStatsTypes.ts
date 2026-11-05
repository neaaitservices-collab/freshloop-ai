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
  lowCount: number;
  rescueVsDiscard: RescueSlice[];
  revenueDays: RevenueDay[];
  /** Last 7 days — single source for rescue/discard chart (units + retail $). */
  outcomeDays: RescueOutcomeDay[];
  departmentAlerts: DepartmentAlert[];
}
