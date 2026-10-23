export type DepartmentType = 'PRODUCE' | 'DAIRY' | 'BAKERY' | 'PANTRY';

export type InventoryStatusType = 'FRESH' | 'WARNING' | 'PULL_RESCUE' | 'MARKDOWN' | 'DISCARDED';

export type TargetActionType = 'KITCHEN_RESCUE' | 'MARKDOWN' | 'DISCARD';

export interface InventoryItem {
  id: string;
  name: string;
  department: DepartmentType;
  quantity: number; // Number of Cases
  unit: string; // Usually 'cases'
  casePackSize: number; // e.g. 40 (lbs/case, units/case, kg/case, ml/case)
  subUnit: string; // 'lbs' | 'kg' | 'g' | 'oz' | 'units' | 'ml' | 'L' | 'fl oz' | 'bunches' | 'loaves' | 'tubs' | 'boxes'
  receivedCost: number; // Cost PER CASE
  receivedDate: string;
  expirationDate: string;
  daysRemaining: number;
  condition: 'Pristine' | 'Slightly Blemished' | 'Bruised' | 'Overripe' | 'Near Expiry';
  status: InventoryStatusType;
  pullThresholdDays: number; // 2, 3, or 4 days threshold
  location: string;
  notes?: string;
  batchCode?: string;
  supplier?: string; // e.g. 'Tony deodato', 'Lakelee', 'Bondi', 'GAMBLES', 'MOORES'
  origin?: string; // e.g. 'ONTARIO', 'CANADA', 'USA', 'MEXICO'
  yieldPct?: number; // Trim & usable yield % (e.g. 94%, 82%, 75%, 100%)
  barcode?: string;
  margin40Price?: number; // Suggested price at 40% margin
  actualMarginPct?: number; // Actual store realized margin %
}

export interface InvoiceLineItemExtract {
  name: string;
  department: DepartmentType;
  quantity: number; // Case quantity
  unit: string; // 'cases'
  casePackSize: number; // e.g. 40
  subUnit: string; // e.g. 'lbs', 'kg', 'units', 'ml'
  unitCost: number; // Cost per case
  totalCost: number;
  productId?: string | null;
  historicalAvgCost?: number | null;
  costVariancePct?: number | null;
  requires_approval?: boolean;
  guardrailReason?: string | null;
}

export interface InvoiceOcrResult {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  departmentBreakdown: {
    PRODUCE: number;
    DAIRY: number;
    BAKERY: number;
    PANTRY: number;
  };
  lineItems: InvoiceLineItemExtract[];
  rawSummary?: string;
  source?: 'sample' | 'photo';
  requiresManagerApproval?: boolean;
  flaggedItemsCount?: number;
  guardrailThresholdPct?: number;
}

export interface VoiceParsedItem {
  name: string;
  quantity: number; // Cases or total quantity
  unit: string; // 'cases' or sub-unit
  casePackSize?: number; // e.g. 40
  subUnit?: string; // e.g. 'lbs', 'units', 'ml', 'kg'
  department: DepartmentType;
  condition: string;
  allergenWarnings: string[];
}

export interface VoiceLoggerResult {
  transcript: string;
  targetAction: TargetActionType;
  parsedItems: VoiceParsedItem[];
  kitchenRescueNotes?: string;
  estimatedWasteSavedValue: number;
}

export interface RecipeIngredient {
  name: string;
  quantity: string;
  department: DepartmentType;
  inventoryItemId?: string;
  estimatedCost: number;
}

export interface RecipeFusionResult {
  id: string;
  recipeName: string;
  category: 'Soup' | 'Salad / Panzanella' | 'Parfait / Dessert' | 'Prepared Hot Meal' | 'Bakery / Bread';
  ingredientsUsed: RecipeIngredient[];
  estimatedYield: string;
  estimatedCost: number;
  targetRetailPrice: number;
  grossMarginPct: number;
  instructions: string[];
  prepTimeMinutes: number;
  chefTips?: string;
  allergens?: string[];
  createdAt: string;
}
