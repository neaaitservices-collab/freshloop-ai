import { NextRequest, NextResponse } from 'next/server';
import { Department, InventoryLocation, TransactionType } from '@prisma/client';
import { prisma, getMovingAverageCost } from '@/lib/domains/inventory/ledger';
import { postProductReceipt } from '@/lib/domains/inventory/stock';
import { INITIAL_INVENTORY_ITEMS } from '@/lib/legacy/mockData';
import { generateContentWithFallback, parseModelJson, tryParseModelJson } from '@/lib/domains/ai/gemini';
import { authErrorResponse } from '@/lib/auth/http';
import { requireReceivingStaff } from '@/lib/auth/guardRoute';
import { requireSessionUser } from '@/lib/auth/session';

// ============================================================================
// Types & Interfaces for Phase 3 Invoice OCR + Cost Guardrail (>20% Variance)
// ============================================================================

export interface InvoiceOcrLineItemWithGuardrail {
  item_name: string;
  product_id: string | null;
  matched_product_name: string | null;
  department: 'PRODUCE' | 'DAIRY' | 'BAKERY' | 'PANTRY';
  quantity: number;
  unit: string;
  case_pack_size: number;
  sub_unit: string;
  unit_cost: number;
  total_cost: number;
  historical_avg_cost: number | null;
  cost_variance_pct: number | null;
  requires_approval: boolean;
  guardrail_reason: string | null;
}

export interface InvoiceOcrApiResponse {
  success: boolean;
  requires_confirmation: boolean; // Global Rule #4: Async Confirmation Loop
  vendor_name: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  guardrail_threshold_pct: number;
  requires_manager_approval: boolean;
  flagged_items_count: number;
  items: InvoiceOcrLineItemWithGuardrail[];
  // Backward-compatible shape for existing UI components
  data: {
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
    lineItems: Array<{
      name: string;
      department: 'PRODUCE' | 'DAIRY' | 'BAKERY' | 'PANTRY';
      quantity: number;
      unit: string;
      casePackSize: number;
      subUnit: string;
      unitCost: number;
      totalCost: number;
      productId?: string | null;
      historicalAvgCost?: number | null;
      costVariancePct?: number | null;
      requires_approval?: boolean;
      guardrailReason?: string | null;
    }>;
    rawSummary: string;
    source: 'sample' | 'photo';
    requiresManagerApproval?: boolean;
    flaggedItemsCount?: number;
    guardrailThresholdPct?: number;
  };
  timestamp: string;
}

// ============================================================================
// Helper: Catalog Lookup & Historical Moving Average Cost Resolution
// ============================================================================

interface CatalogLookupEntry {
  id: string;
  name: string;
  department: Department;
  casePackSize: number;
  standardCostPerUnit: number;
  standardCostPerCase: number;
}

function normalizeItemKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(ctn|sz|pkg|bunch|lbs?|kg|ca|qc|mex|per|cri|can|tx|tha)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadCatalogForCostComparison(): Promise<CatalogLookupEntry[]> {
  try {
    const dbProducts = await prisma.product.findMany();
    if (dbProducts.length > 0) {
      return dbProducts.map((p) => {
        const pack = p.casePackSize && p.casePackSize > 0 ? p.casePackSize : 1;
        const unitStd = p.standardCost ?? 2.0;
        return {
          id: p.id,
          name: p.name,
          department: p.department,
          casePackSize: pack,
          standardCostPerUnit: unitStd,
          standardCostPerCase: Number((unitStd * pack).toFixed(2)),
        };
      });
    }
  } catch {
    // Fallback to mock catalog when DB is unavailable
  }

  return INITIAL_INVENTORY_ITEMS.map((item) => {
    const pack = item.casePackSize && item.casePackSize > 0 ? item.casePackSize : 1;
    return {
      id: item.id,
      name: item.name,
      department: item.department as Department,
      casePackSize: pack,
      standardCostPerUnit: Number((item.receivedCost / pack).toFixed(2)),
      standardCostPerCase: item.receivedCost,
    };
  });
}

function findBestCatalogProduct(
  ocrItemName: string,
  catalog: CatalogLookupEntry[]
): CatalogLookupEntry | null {
  const normOcr = normalizeItemKey(ocrItemName);
  const ocrTokens = normOcr.split(' ').filter((w) => w.length >= 3);

  let bestEntry: CatalogLookupEntry | null = null;
  let bestScore = 0;

  for (const entry of catalog) {
    const normCat = normalizeItemKey(entry.name);
    if (normCat === normOcr) return entry;

    const catTokens = normCat.split(' ').filter((w) => w.length >= 3);
    let matches = 0;
    for (const token of ocrTokens) {
      if (
        catTokens.some(
          (ct) => ct === token || ct.includes(token) || token.includes(ct)
        )
      ) {
        matches++;
      }
    }

    const score =
      ocrTokens.length > 0 ? matches / Math.max(1, Math.min(ocrTokens.length, catTokens.length)) : 0;

    if (score > bestScore && score >= 0.45) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  return bestEntry;
}

/**
 * Evaluates the Cost Guardrail for an extracted invoice line item.
 * If the new unit_cost varies by more than `thresholdPct` (default 20%)
 * compared to the historical Moving Average Cost (`getMovingAverageCost`),
 * flags `requires_approval: true`.
 */
async function evaluateCostGuardrail(
  rawItem: {
    name: string;
    department: 'PRODUCE' | 'DAIRY' | 'BAKERY' | 'PANTRY';
    quantity: number;
    unit: string;
    casePackSize: number;
    subUnit: string;
    unitCost: number;
    totalCost: number;
  },
  catalog: CatalogLookupEntry[],
  thresholdPct: number = 20.0
): Promise<InvoiceOcrLineItemWithGuardrail> {
  const matchedProduct = findBestCatalogProduct(rawItem.name, catalog);
  let historicalAvgCost: number | null = null;

  if (matchedProduct) {
    try {
      const macPerBaseUnit = await getMovingAverageCost(matchedProduct.id);
      if (macPerBaseUnit > 0) {
        // Align unit basis: if invoice unitCost is per case, compare against case-equivalent or unit-equivalent
        const isCaseInvoice =
          rawItem.unit.toLowerCase().includes('case') &&
          rawItem.unitCost > macPerBaseUnit * 2.5 &&
          matchedProduct.casePackSize > 1;

        historicalAvgCost = isCaseInvoice
          ? Number((macPerBaseUnit * matchedProduct.casePackSize).toFixed(2))
          : Number(macPerBaseUnit.toFixed(2));
      }
    } catch {
      // Fallback to catalog baseline cost if DB query fails
      const isCaseInvoice =
        rawItem.unit.toLowerCase().includes('case') &&
        rawItem.unitCost > matchedProduct.standardCostPerUnit * 2.5;
      historicalAvgCost = isCaseInvoice
        ? matchedProduct.standardCostPerCase
        : matchedProduct.standardCostPerUnit;
    }
  }

  let costVariancePct: number | null = null;
  let requiresApproval = false;
  let guardrailReason: string | null = null;

  const invoiceUnitCost = Number.isFinite(rawItem.unitCost) ? rawItem.unitCost : 0;

  if (historicalAvgCost !== null && historicalAvgCost > 0 && invoiceUnitCost >= 0) {
    const rawVariance = ((invoiceUnitCost - historicalAvgCost) / historicalAvgCost) * 100;
    costVariancePct = Number.isFinite(rawVariance) ? Number(rawVariance.toFixed(2)) : null;

    if (costVariancePct !== null && Math.abs(costVariancePct) > thresholdPct) {
      requiresApproval = true;
      const direction = costVariancePct > 0 ? 'increase' : 'decrease';
      guardrailReason = `Cost Guardrail triggered: ${Math.abs(
        costVariancePct
      ).toFixed(1)}% ${direction} vs historical average ($${historicalAvgCost.toFixed(
        2
      )} -> $${rawItem.unitCost.toFixed(2)}, threshold ±${thresholdPct}%).`;
    }
  }

  return {
    item_name: rawItem.name,
    product_id: matchedProduct?.id ?? null,
    matched_product_name: matchedProduct?.name ?? null,
    department: rawItem.department,
    quantity: rawItem.quantity,
    unit: rawItem.unit,
    case_pack_size: rawItem.casePackSize,
    sub_unit: rawItem.subUnit,
    unit_cost: rawItem.unitCost,
    total_cost: rawItem.totalCost,
    historical_avg_cost: historicalAvgCost,
    cost_variance_pct: costVariancePct,
    requires_approval: requiresApproval,
    guardrail_reason: guardrailReason,
  };
}

// ============================================================================
// Gemini 1.5 Flash Vision Invoice Extraction (`@google/generative-ai`)
// ============================================================================

function sampleWholesaleInvoice() {
  return {
    vendorName: 'Tony Deodato & Sons Wholesale Produce',
    invoiceNumber: 'INV-2026-1020-TD',
    invoiceDate: new Date().toISOString().split('T')[0],
    lineItems: [
      {
        name: 'Avocados Hass (Mexico)',
        department: 'PRODUCE' as const,
        quantity: 4,
        unit: 'cases',
        casePackSize: 36,
        subUnit: 'units',
        unitCost: 84.5,
        totalCost: 338.0,
      },
      {
        name: 'Hot House Tomatoes (Ontario)',
        department: 'PRODUCE' as const,
        quantity: 3,
        unit: 'cases',
        casePackSize: 16,
        subUnit: 'lbs',
        unitCost: 42.0,
        totalCost: 126.0,
      },
      {
        name: 'Honey Crisp Apples',
        department: 'PRODUCE' as const,
        quantity: 2,
        unit: 'cases',
        casePackSize: 40,
        subUnit: 'lbs',
        unitCost: 136.0,
        totalCost: 272.0,
      },
      {
        name: 'Whole Heavy Cream 40%',
        department: 'DAIRY' as const,
        quantity: 5,
        unit: 'cases',
        casePackSize: 4,
        subUnit: 'L',
        unitCost: 15.6,
        totalCost: 78.0,
      },
      {
        name: 'Artisanal Sourdough Boule',
        department: 'BAKERY' as const,
        quantity: 2,
        unit: 'cases',
        casePackSize: 9,
        subUnit: 'loaves',
        unitCost: 19.5,
        totalCost: 39.0,
      },
    ],
    modelNote: 'Sample wholesale invoice. Take a photo to read a real delivery.',
  };
}

async function extractInvoiceWithGemini15FlashVision(
  imageBase64: string,
  mimeType: string = 'image/jpeg',
  demo = false
): Promise<{
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  lineItems: Array<{
    name: string;
    department: 'PRODUCE' | 'DAIRY' | 'BAKERY' | 'PANTRY';
    quantity: number;
    unit: string;
    casePackSize: number;
    subUnit: string;
    unitCost: number;
    totalCost: number;
  }>;
  modelNote: string;
}> {
  if (demo || !imageBase64) {
    return sampleWholesaleInvoice();
  }

  const visionPrompt = `You are the FreshLoop AI Enterprise Invoice OCR Vision Engine.
Analyze this supermarket vendor invoice image and return ONLY valid JSON matching this schema:
{
  "vendorName": "string",
  "invoiceNumber": "string",
  "invoiceDate": "YYYY-MM-DD",
  "lineItems": [
    {
      "name": "string (product name on invoice)",
      "department": "PRODUCE" | "DAIRY" | "BAKERY" | "PANTRY",
      "quantity": number,
      "unit": "cases" | "lbs" | "kg" | "units" | "L" | "bunches" | "tubs" | "loaves",
      "casePackSize": number,
      "subUnit": "lbs" | "kg" | "units" | "L" | "bunches" | "tubs" | "loaves",
      "unitCost": number,
      "totalCost": number
    }
  ]
}`;

  const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
  const { text, modelUsed } = await generateContentWithFallback(
    visionPrompt,
    { data: cleanBase64, mimeType: mimeType || 'image/jpeg' },
    ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']
  );

  const parsed = tryParseModelJson<Record<string, unknown>>(text);
  if (!parsed || !Array.isArray(parsed.lineItems) || parsed.lineItems.length === 0) {
    throw new Error(
      'The invoice text could not be parsed as structured JSON. Try a clearer photo of the line-item table.'
    );
  }

  return {
    vendorName: String(parsed.vendorName || 'Fresh Grocer Wholesale'),
    invoiceNumber: String(
      parsed.invoiceNumber || `INV-${Math.floor(Math.random() * 90000 + 10000)}`
    ),
    invoiceDate: String(parsed.invoiceDate || new Date().toISOString().split('T')[0]),
    lineItems: parsed.lineItems.map((li: Record<string, unknown>) => {
      const qty = Number(li.quantity) > 0 ? Number(li.quantity) : 1;
      const unitCost = Number(li.unitCost ?? li.unit_cost) || 0;
      const totalCost =
        Number(li.totalCost ?? li.total_cost) || Number((qty * unitCost).toFixed(2));
      return {
        name: String(li.name || li.item_name || 'Vendor Line Item'),
        department: (['PRODUCE', 'DAIRY', 'BAKERY', 'PANTRY'].includes(String(li.department))
          ? String(li.department)
          : 'PRODUCE') as 'PRODUCE' | 'DAIRY' | 'BAKERY' | 'PANTRY',
        quantity: qty,
        unit: String(li.unit || 'cases'),
        casePackSize: Number(li.casePackSize) > 0 ? Number(li.casePackSize) : 1,
        subUnit: String(li.subUnit || 'units'),
        unitCost,
        totalCost,
      };
    }),
    modelNote: `Read from the photo with ${modelUsed}.`,
  };
}

// ============================================================================
// POST /api/invoice-ocr
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    await requireSessionUser();
    const body = await req.json();
    const {
      imageBase64,
      mimeType,
      demo,
      confirmCommit,
      confirmedItems,
      invoiceNumber: confirmedInvoiceNum,
      staffId,
    } = body as {
      imageBase64?: string;
      mimeType?: string;
      demo?: boolean;
      confirmCommit?: boolean;
      confirmedItems?: Array<{
        product_id: string;
        quantity: number;
        unit_cost: number;
        to_location?: InventoryLocation;
      }>;
      invoiceNumber?: string;
      staffId?: string;
    };

    // ------------------------------------------------------------------------
    // Optional Step 2 of Async Confirmation Loop:
    // Commits Receive transactions into `Inventory_Transactions` ONLY when
    // explicitly confirmed by the user/manager (`confirmCommit: true`).
    // ------------------------------------------------------------------------
    if (confirmCommit && Array.isArray(confirmedItems) && confirmedItems.length > 0) {
      const actor = await requireReceivingStaff();
      const referenceId = confirmedInvoiceNum || `INV-OCR-${Date.now()}`;
      const receipts = [];
      for (const item of confirmedItems) {
        const productId = String(item.product_id ?? '').trim();
        if (!productId) continue;
        receipts.push(
          await postProductReceipt({
            productId,
            quantityUnits: Math.abs(Number(item.quantity) || 1),
            unitCostAtTime: Number(item.unit_cost) || 0,
            staffId: actor.id,
            referenceId,
            toLocation: item.to_location || InventoryLocation.Retail_Floor,
            notes: 'Confirmed Invoice OCR Receipt',
          })
        );
      }

      return NextResponse.json({
        success: true,
        committed: true,
        transactionsCreated: receipts.length,
        receipts,
        timestamp: new Date().toISOString(),
      });
    }

    if (!imageBase64 && !demo) {
      return NextResponse.json(
        { error: 'Missing imageBase64 in request body (or pass demo: true)' },
        { status: 400 }
      );
    }

    // Load guardrail threshold from StoreSetting (defaults to 20%)
    let guardrailThresholdPct = 20.0;
    try {
      const setting = await prisma.storeSetting.findFirst();
      if (setting?.costGuardrailVariancePct) {
        guardrailThresholdPct = setting.costGuardrailVariancePct;
      }
    } catch {
      // Keep default 20%
    }

    const [extracted, catalog] = await Promise.all([
      extractInvoiceWithGemini15FlashVision(
        imageBase64 || '',
        mimeType || 'image/jpeg',
        Boolean(demo)
      ),
      loadCatalogForCostComparison(),
    ]);

    // Evaluate Cost Guardrail (>20% variance vs historical Moving Average Cost) for each item
    const auditedItems: InvoiceOcrLineItemWithGuardrail[] = [];
    for (const rawItem of extracted.lineItems) {
      const audited = await evaluateCostGuardrail(
        rawItem,
        catalog,
        guardrailThresholdPct
      );
      auditedItems.push(audited);
    }

    const departmentBreakdown = {
      PRODUCE: 0,
      DAIRY: 0,
      BAKERY: 0,
      PANTRY: 0,
    };

    for (const item of auditedItems) {
      departmentBreakdown[item.department] = Number(
        (departmentBreakdown[item.department] + item.total_cost).toFixed(2)
      );
    }

    const totalAmount = Number(
      auditedItems.reduce((sum, item) => sum + item.total_cost, 0).toFixed(2)
    );
    const flaggedItemsCount = auditedItems.filter(
      (item) => item.requires_approval
    ).length;

    const responsePayload: InvoiceOcrApiResponse = {
      success: true,
      requires_confirmation: true, // Global Rule #4: Never write directly without confirmation
      vendor_name: extracted.vendorName,
      invoice_number: extracted.invoiceNumber,
      invoice_date: extracted.invoiceDate,
      total_amount: totalAmount,
      guardrail_threshold_pct: guardrailThresholdPct,
      requires_manager_approval: flaggedItemsCount > 0,
      flagged_items_count: flaggedItemsCount,
      items: auditedItems,
      data: {
        vendorName: extracted.vendorName,
        invoiceNumber: extracted.invoiceNumber,
        invoiceDate: extracted.invoiceDate,
        totalAmount,
        departmentBreakdown,
        lineItems: auditedItems.map((item) => ({
          name: item.item_name,
          department: item.department,
          quantity: item.quantity,
          unit: item.unit,
          casePackSize: item.case_pack_size,
          subUnit: item.sub_unit,
          unitCost: item.unit_cost,
          totalCost: item.total_cost,
          productId: item.product_id,
          historicalAvgCost: item.historical_avg_cost,
          costVariancePct: item.cost_variance_pct,
          requires_approval: item.requires_approval,
          guardrailReason: item.guardrail_reason,
        })),
        rawSummary:
          flaggedItemsCount > 0
            ? `Cost Guardrail Alert: ${flaggedItemsCount} item(s) vary by >${guardrailThresholdPct}% from historical Moving Average Cost and require approval.`
            : extracted.modelNote,
        source: demo || !imageBase64 ? 'sample' : 'photo',
        requiresManagerApproval: flaggedItemsCount > 0,
        flaggedItemsCount,
        guardrailThresholdPct: guardrailThresholdPct,
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(responsePayload);
  } catch (error: unknown) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    console.error('API Error in /api/invoice-ocr:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to process vendor invoice OCR',
      },
      { status: 500 }
    );
  }
}
