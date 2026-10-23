export interface RescueSlice {
  name: string;
  units: number;
}

export interface RevenueDay {
  label: string;
  lost: number;
  recovered: number;
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
  targetWastePct: number;
  pulls: number;
  lowCount: number;
  rescueVsDiscard: RescueSlice[];
  revenueDays: RevenueDay[];
  departmentAlerts: DepartmentAlert[];
}
