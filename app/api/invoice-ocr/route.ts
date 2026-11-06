import { NextRequest, NextResponse } from 'next/server';
import { Department, InventoryLocation } from '@prisma/client';
import { getMovingAverageCostMap } from '@/lib/domains/inventory/ledger';
import { loadProductCatalog } from '@/lib/domains/catalog/productCatalog';
import {
  commitInvoiceOcrReceipts,
  type OcrInvoiceMeta,
} from '@/lib/domains/receiving/invoiceOcrCommit';
import { generateContentWithFallback, tryParseModelJson } from '@/lib/domains/ai/gemini';
import { invoiceOcrModelCandidates } from '@/lib/domains/ai/geminiModels';
import { handleApiRouteError, logServerError } from '@/lib/domains/ai/apiError';
import { invoiceOcrErrorResponse } from '@/lib/domains/receiving/invoiceOcrErrors';
import { authErrorResponse } from '@/lib/auth/http';
import { requireReceivingStaff } from '@/lib/auth/guardRoute';
import { requireSessionUser } from '@/lib/auth/session';
import { findLatestStoreSetting } from '@/lib/domains/stats/storeSettingSelect';
import { matchProduct } from '@/lib/domains/inventory/productMatching';
import { upsertSupplierByName } from '@/lib/domains/suppliers/suppliers';
import { assertHotPathRateLimit } from '@/lib/security/rateLimit';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

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
  case_retail_price: number | null;
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
    supplierId?: string;
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
      caseRetailPrice?: number | null;
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

async function loadCatalogForCostComparison(): Promise<CatalogLookupEntry[]> {
  const rows = await loadProductCatalog();
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    department: p.department,
    casePackSize: p.casePackSize,
    standardCostPerUnit: p.standardCostPerUnit,
    standardCostPerCase: p.standardCostPerCase,
  }));
}

function findBestCatalogProduct(
  ocrItemName: string,
  catalog: CatalogLookupEntry[]
): CatalogLookupEntry | null {
  return matchProduct(ocrItemName, catalog);
}

/**
 * Evaluates the Cost Guardrail for an extracted invoice line item.
 * If the new unit_cost varies by more than `thresholdPct` (default 20%)
 * compared to the historical Moving Average Cost (`getMovingAverageCost`),
 * flags `requires_approval: true`.
 */
type RawOcrLineItem = {
  name: string;
  department: 'PRODUCE' | 'DAIRY' | 'BAKERY' | 'PANTRY';
  quantity: number;
  unit: string;
  casePackSize: number;
  subUnit: string;
  unitCost: number;
  totalCost: number;
  caseRetailPrice?: number | null;
};

function evaluateCostGuardrailSync(
  rawItem: RawOcrLineItem,
  matchedProduct: CatalogLookupEntry | null,
  macPerBaseUnit: number | undefined,
  thresholdPct: number = 20.0
): InvoiceOcrLineItemWithGuardrail {
  let historicalAvgCost: number | null = null;

  if (matchedProduct) {
    const mac = macPerBaseUnit ?? 0;
    if (mac > 0) {
      const isCaseInvoice =
        rawItem.unit.toLowerCase().includes('case') &&
        rawItem.unitCost > mac * 2.5 &&
        matchedProduct.casePackSize > 1;

      historicalAvgCost = isCaseInvoice
        ? Number((mac * matchedProduct.casePackSize).toFixed(2))
        : Number(mac.toFixed(2));
    } else {
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
    case_retail_price:
      rawItem.caseRetailPrice !== undefined && rawItem.caseRetailPrice !== null
        ? rawItem.caseRetailPrice
        : null,
    historical_avg_cost: historicalAvgCost,
    cost_variance_pct: costVariancePct,
    requires_approval: requiresApproval,
    guardrail_reason: guardrailReason,
  };
}

async function evaluateCostGuardrailsBatch(
  lineItems: RawOcrLineItem[],
  catalog: CatalogLookupEntry[],
  thresholdPct: number
): Promise<InvoiceOcrLineItemWithGuardrail[]> {
  const matches = lineItems.map((rawItem) => ({
    rawItem,
    matchedProduct: findBestCatalogProduct(rawItem.name, catalog),
  }));
  const productIds = matches
    .map((row) => row.matchedProduct?.id)
    .filter((id): id is string => Boolean(id));
  const macMap = await getMovingAverageCostMap(productIds);

  return matches.map(({ rawItem, matchedProduct }) =>
    evaluateCostGuardrailSync(
      rawItem,
      matchedProduct,
      matchedProduct ? macMap.get(matchedProduct.id) : undefined,
      thresholdPct
    )
  );
}

// ============================================================================
// Gemini Flash Vision Invoice Extraction (`@google/generative-ai`)
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
    caseRetailPrice?: number | null;
  }>;
  modelNote: string;
}> {
  if (demo || !imageBase64) {
    return sampleWholesaleInvoice();
  }

  const visionPrompt = `Extract this vendor invoice as JSON only:
{"vendorName":"","invoiceNumber":"","invoiceDate":"YYYY-MM-DD","lineItems":[{"name":"","department":"PRODUCE|DAIRY|BAKERY|PANTRY","quantity":0,"unit":"cases","casePackSize":0,"subUnit":"lbs|units|L|loaves","unitCost":0,"totalCost":0,"caseRetailPrice":null}]}
Rules: unitCost/totalCost per case when unit is cases; caseRetailPrice = printed case list price or null; product names only (no pack codes in name).`;

  const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
  const ocrModels = invoiceOcrModelCandidates();
  /** REST-first + short retry list keeps median latency low; fallback widens search only on failure. */
  const ocrOpts = {
    skipModelDiscovery: true as const,
    maxModelsToTry: 3,
    preferRestApi: true as const,
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 8192,
    },
  };
  let text: string;
  let modelUsed: string;
  try {
    ({ text, modelUsed } = await generateContentWithFallback(
      visionPrompt,
      { data: cleanBase64, mimeType: mimeType || 'image/jpeg' },
      ocrModels,
      ocrOpts
    ));
  } catch {
    ({ text, modelUsed } = await generateContentWithFallback(
      visionPrompt,
      { data: cleanBase64, mimeType: mimeType || 'image/jpeg' },
      ocrModels,
      {
        skipModelDiscovery: false,
        maxModelsToTry: 5,
        preferRestApi: true,
        generationConfig: { temperature: 0, maxOutputTokens: 8192 },
      }
    ));
  }

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
      const caseRetailRaw = li.caseRetailPrice ?? li.case_retail_price ?? li.retail_price;
      const caseRetailPrice =
        caseRetailRaw !== undefined && caseRetailRaw !== null && Number(caseRetailRaw) > 0
          ? Number(caseRetailRaw)
          : null;
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
        caseRetailPrice,
      };
    }),
    modelNote: `Read from the photo with ${modelUsed}.`,
  };
}

// ============================================================================
// POST /api/invoice-ocr
// ============================================================================

export async function POST(req: NextRequest) {
  let actorId: string | undefined;
  let operation: 'preview' | 'commit' = 'preview';
  let referenceId: string | undefined;
  try {
    const actor = await requireSessionUser();
    const limited = assertHotPathRateLimit(actor.id, 'invoiceOcr');
    if (limited) return limited;
    const body = await req.json();
    const {
      imageBase64,
      mimeType,
      demo,
      confirmCommit,
      confirmedItems,
      invoiceNumber: confirmedInvoiceNum,
      invoiceMeta,
    } = body as {
      imageBase64?: string;
      mimeType?: string;
      demo?: boolean;
      confirmCommit?: boolean;
      confirmedItems?: Array<{
        product_id: string;
        quantity: number;
        quantity_kind?: 'units' | 'cases';
        unit_cost: number;
        to_location?: InventoryLocation;
        line_name?: string;
        department?: Department;
        case_pack_size?: number;
      }>;
      invoiceNumber?: string;
      staffId?: string;
      invoiceMeta?: OcrInvoiceMeta;
    };

    // ------------------------------------------------------------------------
    // Optional Step 2 of Async Confirmation Loop:
    // Commits Receive transactions into `Inventory_Transactions` ONLY when
    // explicitly confirmed by the user/manager (`confirmCommit: true`).
    // ------------------------------------------------------------------------
    if (confirmCommit && Array.isArray(confirmedItems) && confirmedItems.length > 0) {
      operation = 'commit';
      const commitActor = await requireReceivingStaff();
      actorId = commitActor.id;
      referenceId = confirmedInvoiceNum || `INV-OCR-${Date.now()}`;
      const committed = await commitInvoiceOcrReceipts({
        staffId: commitActor.id,
        referenceId,
        confirmedItems,
        invoiceMeta: invoiceMeta ?? null,
      });

      return NextResponse.json({
        success: true,
        committed: true,
        invoiceId: committed.invoiceId,
        transactionsCreated: committed.transactionsCreated,
        receipts: committed.receipts,
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
      const setting = await findLatestStoreSetting();
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

    const auditedItems = await evaluateCostGuardrailsBatch(
      extracted.lineItems,
      catalog,
      guardrailThresholdPct
    );

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

    const globalSupplier = await upsertSupplierByName({ name: extracted.vendorName });

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
        supplierId: globalSupplier.id,
        invoiceNumber: extracted.invoiceNumber,
        invoiceDate: extracted.invoiceDate,
        totalAmount,
        departmentBreakdown,
        lineItems: auditedItems.map((item) => ({
          name: item.item_name,
          matchedProductName: item.matched_product_name,
          department: item.department,
          quantity: item.quantity,
          unit: item.unit,
          casePackSize: item.case_pack_size,
          subUnit: item.sub_unit,
          unitCost: item.unit_cost,
          totalCost: item.total_cost,
          caseRetailPrice: item.case_retail_price,
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
    const ocrRes = invoiceOcrErrorResponse(error);
    if (ocrRes) {
      logServerError('POST /api/invoice-ocr', error, {
        path: '/api/invoice-ocr',
        actorId,
        referenceId,
        operation,
      });
      return ocrRes;
    }
    return handleApiRouteError(
      'POST /api/invoice-ocr',
      error,
      'Failed to process the invoice. Please try again.',
      {
        path: '/api/invoice-ocr',
        actorId,
        referenceId,
        operation,
      }
    );
  }
}
