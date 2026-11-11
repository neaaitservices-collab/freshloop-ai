export type DepartmentType = 'PRODUCE' | 'DAIRY' | 'BAKERY' | 'PANTRY' | 'DELI_KITCHEN';

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
  /** Printed case list / shelf price on invoice when visible (optional). */
  caseRetailPrice?: number | null;
  productId?: string | null;
  /** Catalog SKU name when OCR matched an existing product (invoice line name may differ). */
  matchedProductName?: string | null;
  historicalAvgCost?: number | null;
  costVariancePct?: number | null;
  requires_approval?: boolean;
  guardrailReason?: string | null;
  /** Model OCR certainty for this line (0–1). */
  extractionConfidence?: number;
  /** Catalog fuzzy-match certainty (0–1). */
  matchConfidence?: number | null;
  /** Blended score used for review threshold (0–1). */
  lineConfidence?: number;
  needsManualReview?: boolean;
  /** Server delivery UUID. The receiving board posts this id and does not mint another. */
  deliveryId?: string;
}

export interface InvoiceOcrResult {
  vendorName: string;
  /** Global supplier row (upserted from OCR vendor name). */
  supplierId?: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  departmentBreakdown: {
    PRODUCE: number;
    DAIRY: number;
    BAKERY: number;
    PANTRY: number;
    DELI_KITCHEN?: number;
  };
  lineItems: InvoiceLineItemExtract[];
  rawSummary?: string;
  source?: 'sample' | 'photo';
  requiresManagerApproval?: boolean;
  flaggedItemsCount?: number;
  guardrailThresholdPct?: number;
  needsManualReview?: boolean;
  lowConfidenceItemsCount?: number;
  ocrConfidenceThreshold?: number;
  /** Server scan id. Corrections and commit both use this draft. */
  draftId?: string;
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
