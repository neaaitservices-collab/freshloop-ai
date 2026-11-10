/**
 * Display names for ledger locations. Enum and database values stay unchanged.
 * Production locations share one staff-facing name.
 */
const LOCATION_LABELS: Record<string, string> = {
  External_Vendor: 'Vendor',
  Main_Storage: 'Storage',
  Retail_Floor: 'Sales floor',
  Kitchen_Prep: 'Production',
  Deli_Grab_N_Go: 'Production',
  Customer_Out: 'Sold',
  Waste_Bin: 'Waste',
};

export function locationLabel(value: string): string {
  return LOCATION_LABELS[value] ?? value.replaceAll('_', ' ');
}
