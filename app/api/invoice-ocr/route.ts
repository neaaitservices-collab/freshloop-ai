import { NextRequest, NextResponse } from 'next/server';
import { Department } from '@prisma/client';
import { getMovingAverageCostMap } from '@/lib/domains/inventory/ledger';
import { loadProductCatalog } from '@/lib/domains/catalog/productCatalog';
import { saveInvoiceOcrDraft } from '@/lib/domains/receiving/invoiceOcrCommit';
import { settleStoredOcrDraft } from '@/lib/domains/receiving/invoiceOcrSettle';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import { generateContentWithFallback, tryParseModelJson } from '@/lib/domains/ai/gemini';
import { invoiceOcrModelCandidates } from '@/lib/domains/ai/geminiModels';
import { handleApiRouteError, logServerError } from '@/lib/domains/ai/apiError';
import { invoiceOcrErrorResponse } from '@/lib/domains/receiving/invoiceOcrErrors';
import { authErrorResponse } from '@/lib/auth/http';
import { requireReceivingStaff } from '@/lib/auth/guardRoute';
import { findLatestStoreSetting } from '@/lib/domains/stats/storeSettingSelect';
import { matchProductWithScore } from '@/lib/domains/inventory/productMatching';
import { VENDOR_PRICE_ALERT_DEFAULT_PCT as _VENDOR_PRICE_ALERT_UNUSED } from '@/lib/domains/suppliers/vendorAnalyticsTypes';
import { assertHotPathRateLimit } from '@/lib/security/rateLimit';
import { invoiceOcrCommitBodySchema, invoiceOcrResolveBodySchema } from '@/lib/security/schemas/invoiceOcr';
import {
  INVOICE_OCR_CONFIDENCE_THRESHOLD,
  combineLineConfidence,
  lineNeedsManualReview,
  matchConfidenceFromCatalogScore,
  normalizeExtractionConfidence,
} from '@/lib/domains/receiving/invoiceOcrConfidence';
import { parseInvoiceIdentity, parseInvoiceLineFields } from '@/lib/domains/receiving/invoiceOcrParse';
import {
  buildAuthoritativeOcrDraft,
  draftPostingBlockers,
} from '@/lib/domains/receiving/invoiceOcrDraft';
import type { RoleName } from '@/lib/utils/roles';

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
  extraction_confidence: number;
  match_confidence: number | null;
  line_confidence: number;
  needs_manual_review: boolean;
  department_assumed: boolean;
  quantity_unreadable: boolean;
  name_unreadable: boolean;
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
  needs_manual_review: boolean;
  low_confidence_items_count: number;
  ocr_confidence_threshold: number;
  draftId: string;
  blockers?: string[];
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
    draftId?: string;
    lineItems: Array<{
      name: string;
      deliveryId?: string;
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
      extractionConfidence?: number;
      matchConfidence?: number | null;
      lineConfidence?: number;
      needsManualReview?: boolean;
    }>;
    rawSummary: string;
    source: 'sample' | 'photo';
    requiresManagerApproval?: boolean;
    flaggedItemsCount?: number;
    guardrailThresholdPct?: number;
    needsManualReview?: boolean;
    lowConfidenceItemsCount?: number;
    ocrConfidenceThreshold?: number;
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
  extractionConfidence?: number;
  departmentAssumed?: boolean;
  quantityUnreadable?: boolean;
};

function evaluateCostGuardrailSync(
  rawItem: RawOcrLineItem,
  matchedProduct: CatalogLookupEntry | null,
  matchScore: number | null,
  macPerBaseUnit: number | undefined,
  thresholdPct: number = 20.0,
  ocrSource: 'sample' | 'photo' = 'photo'
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

  const extractionConfidence = normalizeExtractionConfidence(
    rawItem.extractionConfidence,
    ocrSource
  );
  const matchConfidence =
    matchScore !== null ? matchConfidenceFromCatalogScore(matchScore) : null;
  const lineConfidence = combineLineConfidence(extractionConfidence, matchConfidence);
  const needsManualReview =
    lineNeedsManualReview(lineConfidence) ||
    rawItem.quantityUnreadable === true ||
    rawItem.departmentAssumed === true;

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
    extraction_confidence: extractionConfidence,
    match_confidence: matchConfidence,
    line_confidence: lineConfidence,
    needs_manual_review: needsManualReview,
    department_assumed: rawItem.departmentAssumed === true,
    quantity_unreadable: rawItem.quantityUnreadable === true || !(rawItem.quantity > 0),
    name_unreadable: !rawItem.name.trim() || rawItem.name.startsWith('Unread line '),
  };
}

async function evaluateCostGuardrailsBatch(
  lineItems: RawOcrLineItem[],
  catalog: CatalogLookupEntry[],
  thresholdPct: number,
  ocrSource: 'sample' | 'photo'
): Promise<InvoiceOcrLineItemWithGuardrail[]> {
  const matches = lineItems.map((rawItem) => {
    const hit = matchProductWithScore(rawItem.name, catalog);
    return {
      rawItem,
      matchedProduct: hit?.product ?? null,
      matchScore: hit?.score ?? null,
    };
  });
  const productIds = matches
    .map((row) => row.matchedProduct?.id)
    .filter((id): id is string => Boolean(id));
  const macMap = await getMovingAverageCostMap(productIds);

  return matches.map(({ rawItem, matchedProduct, matchScore }) =>
    evaluateCostGuardrailSync(
      rawItem,
      matchedProduct,
      matchScore,
      matchedProduct ? macMap.get(matchedProduct.id) : undefined,
      thresholdPct,
      ocrSource
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
    departmentAssumed?: boolean;
    quantityUnreadable?: boolean;
  }>;
  modelNote: string;
}> {
  if (demo || !imageBase64) {
    return sampleWholesaleInvoice();
  }

  const visionPrompt = `Extract this vendor invoice as JSON only:
{"vendorName":"","invoiceNumber":"","invoiceDate":"YYYY-MM-DD","lineItems":[{"name":"","department":"PRODUCE|DAIRY|BAKERY|PANTRY","quantity":0,"unit":"cases","casePackSize":0,"subUnit":"lbs|units|L|loaves","unitCost":0,"totalCost":0,"caseRetailPrice":null,"extractionConfidence":0.0}]}
Rules: unitCost/totalCost per case when unit is cases; caseRetailPrice = printed case list price or null; product names only (no pack codes in name). extractionConfidence = your certainty for that row (0.0-1.0).`;

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

  const identity = parseInvoiceIdentity(parsed);
  return {
    vendorName: identity.vendorName,
    invoiceNumber: identity.invoiceNumber,
    invoiceDate: identity.invoiceDate,
    lineItems: parsed.lineItems.map((li: Record<string, unknown>, index: number) => {
      const fields = parseInvoiceLineFields(li, index + 1);
      const unitCost = Number(li.unitCost ?? li.unit_cost) || 0;
      const totalCost =
        Number(li.totalCost ?? li.total_cost) ||
        (fields.quantity > 0 ? Number((fields.quantity * unitCost).toFixed(2)) : 0);
      const caseRetailRaw = li.caseRetailPrice ?? li.case_retail_price ?? li.retail_price;
      const caseRetailPrice =
        caseRetailRaw !== undefined && caseRetailRaw !== null && Number(caseRetailRaw) > 0
          ? Number(caseRetailRaw)
          : null;
      return {
        name: fields.name,
        department: fields.department,
        quantity: fields.quantity,
        unit: fields.unit,
        casePackSize: Number(li.casePackSize) > 0 ? Number(li.casePackSize) : 1,
        subUnit: String(li.subUnit || 'units'),
        unitCost,
        totalCost,
        caseRetailPrice,
        extractionConfidence: normalizeExtractionConfidence(
          li.extractionConfidence ?? li.extraction_confidence ?? li.confidence,
          'photo'
        ),
        departmentAssumed: fields.departmentAssumed,
        quantityUnreadable: fields.quantityUnreadable,
      };
    }),
    modelNote: [`Read from the photo with ${modelUsed}.`, ...identity.gaps].filter(Boolean).join(' '),
  };
}

function responseForSettledDraft(
  outcome: Awaited<ReturnType<typeof settleStoredOcrDraft>>
): NextResponse {
  if (outcome.kind === 'missing') {
    return NextResponse.json(
      { success: false, error: 'Invoice scan was not found. Scan the invoice again.' },
      { status: 404 }
    );
  }
  if (outcome.kind === 'expired') {
    return NextResponse.json(
      { success: false, error: 'Invoice scan expired. Scan the invoice again.' },
      { status: 409 }
    );
  }
  if (outcome.kind === 'sample') {
    return NextResponse.json({ success: false, error: outcome.error }, { status: 409 });
  }
  if (outcome.kind === 'blocked') {
    return NextResponse.json(
      {
        success: true,
        committed: false,
        saved: true,
        blockers: outcome.blockers,
        payload: outcome.payload,
      },
      { status: outcome.blockers.length > 0 ? 409 : 200 }
    );
  }
  if (outcome.kind === 'replay') {
    return NextResponse.json({
      success: true,
      committed: true,
      idempotent: true,
      result: outcome.result,
      payload: outcome.payload,
    });
  }
  if (outcome.kind === 'conflict') {
    return NextResponse.json(
      { success: false, committed: false, conflict: true, error: outcome.error, result: outcome.result },
      { status: 409 }
    );
  }
  invalidateInventoryCaches();
  return NextResponse.json({
    success: true,
    committed: true,
    invoiceId: outcome.result.invoiceId,
    transactionsCreated: outcome.result.transactionsCreated,
    receipts: outcome.result.receipts,
    payload: outcome.payload,
  });
}

// ============================================================================
// POST /api/invoice-ocr
// ============================================================================

export async function POST(req: NextRequest) {
  let actorId: string | undefined;
  let operation: 'preview' | 'commit' = 'preview';
  let referenceId: string | undefined;
  try {
    const actor = await requireReceivingStaff();
    const limited = assertHotPathRateLimit(actor.id, 'invoiceOcr');
    if (limited) return limited;
    const rawBody = await req.json();
    if (
      rawBody &&
      typeof rawBody === 'object' &&
      (rawBody as { resolveDraft?: boolean }).resolveDraft === true
    ) {
      operation = 'commit';
      const resolveBody = invoiceOcrResolveBodySchema.parse(rawBody);
      actorId = actor.id;
      const managerRoles: RoleName[] = ['ADMIN', 'STORE_MANAGER'];
      const outcome = await settleStoredOcrDraft({
        draftId: resolveBody.draftId,
        staffId: actor.id,
        actorIsManager: managerRoles.includes(actor.role),
        manualReviewOverride: Boolean(resolveBody.manualReviewOverride),
        resolutions: resolveBody.resolutions,
        post: false,
      });
      return responseForSettledDraft(outcome);
    }
    if (
      rawBody &&
      typeof rawBody === 'object' &&
      (rawBody as { confirmCommit?: boolean }).confirmCommit === true
    ) {
      operation = 'commit';
      const commitBody = invoiceOcrCommitBodySchema.parse(rawBody);
      actorId = actor.id;
      const managerRoles: RoleName[] = ['ADMIN', 'STORE_MANAGER'];
      const actorIsManager = managerRoles.includes(actor.role);
      referenceId = commitBody.draftId;
      const outcome = await settleStoredOcrDraft({
        draftId: commitBody.draftId,
        staffId: actor.id,
        actorIsManager,
        manualReviewOverride: Boolean(commitBody.manualReviewOverride),
        resolutions: commitBody.resolutions,
        post: true,
      });
      return responseForSettledDraft(outcome);
    }

    const { imageBase64, mimeType, demo } = rawBody as {
      imageBase64?: string;
      mimeType?: string;
      demo?: boolean;
    };

    if (!imageBase64 && !demo) {
      return NextResponse.json(
        { error: 'Missing imageBase64 in request body (or pass demo: true)' },
        { status: 400 }
      );
    }
    if (typeof imageBase64 === 'string' && imageBase64.length > 2_000_000) {
      return NextResponse.json(
        { success: false, error: 'Invoice photo is too large. Use a closer crop and try again.' },
        { status: 413 }
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

    const ocrSource: 'sample' | 'photo' = demo || !imageBase64 ? 'sample' : 'photo';
    const auditedItems = await evaluateCostGuardrailsBatch(
      extracted.lineItems,
      catalog,
      guardrailThresholdPct,
      ocrSource
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
    const lowConfidenceItemsCount = auditedItems.filter((item) => item.needs_manual_review).length;
    const needsManualReview = lowConfidenceItemsCount > 0;

    const draftPayload = buildAuthoritativeOcrDraft({
      vendorName: extracted.vendorName,
      invoiceNumber: extracted.invoiceNumber,
      invoiceDate: extracted.invoiceDate,
      totalAmount,
      departmentBreakdown,
      lines: auditedItems.map((item) => ({
        item_name: item.item_name,
        product_id: item.product_id,
        quantity: item.quantity,
        unit: item.unit,
        unit_cost: item.unit_cost,
        department: item.department,
        case_pack_size: item.case_pack_size,
        line_confidence: item.line_confidence,
        requires_approval: item.requires_approval,
        department_assumed: item.department_assumed,
        quantity_unreadable: item.quantity_unreadable,
      })),
    });
    const draft =
      ocrSource === 'sample' ? null : await saveInvoiceOcrDraft(actor.id, draftPayload);

    const responsePayload: InvoiceOcrApiResponse = {
      success: true,
      requires_confirmation: true, // Global Rule #4: Never write directly without confirmation
      vendor_name: extracted.vendorName,
      invoice_number: extracted.invoiceNumber,
      invoice_date: extracted.invoiceDate,
      total_amount: totalAmount,
      guardrail_threshold_pct: guardrailThresholdPct,
      requires_manager_approval: flaggedItemsCount > 0 || needsManualReview,
      flagged_items_count: flaggedItemsCount,
      needs_manual_review: needsManualReview,
      low_confidence_items_count: lowConfidenceItemsCount,
      ocr_confidence_threshold: INVOICE_OCR_CONFIDENCE_THRESHOLD,
      draftId: draft?.id ?? '',
      blockers: draftPostingBlockers(draftPayload, {
        actorIsManager: false,
        manualReviewOverride: false,
      }),
      items: auditedItems,
      data: {
        vendorName: extracted.vendorName,
        invoiceNumber: extracted.invoiceNumber,
        invoiceDate: extracted.invoiceDate,
        totalAmount,
        departmentBreakdown,
        draftId: draft?.id ?? '',
        lineItems: auditedItems.map((item, index) => ({
          name: item.item_name,
          deliveryId: draftPayload.lines[index]?.delivery_id,
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
          extractionConfidence: item.extraction_confidence,
          matchConfidence: item.match_confidence,
          lineConfidence: item.line_confidence,
          needsManualReview: item.needs_manual_review,
        })),
        rawSummary: (() => {
          const parts: string[] = [];
          if (needsManualReview) {
            parts.push(
              `Manual review: ${lowConfidenceItemsCount} line(s) are below ${Math.round(
                INVOICE_OCR_CONFIDENCE_THRESHOLD * 100
              )}% OCR confidence.`
            );
          }
          if (flaggedItemsCount > 0) {
            parts.push(
              `Cost Guardrail: ${flaggedItemsCount} item(s) vary by >${guardrailThresholdPct}% from historical moving average cost.`
            );
          }
          if (parts.length > 0) return parts.join(' ');
          return extracted.modelNote;
        })(),
        source: ocrSource,
        requiresManagerApproval: flaggedItemsCount > 0 || needsManualReview,
        flaggedItemsCount,
        guardrailThresholdPct: guardrailThresholdPct,
        needsManualReview,
        lowConfidenceItemsCount,
        ocrConfidenceThreshold: INVOICE_OCR_CONFIDENCE_THRESHOLD,
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
