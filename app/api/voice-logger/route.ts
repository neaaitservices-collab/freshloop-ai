import { NextRequest, NextResponse } from 'next/server';
import { Department, InventoryLocation, TransactionType } from '@prisma/client';
import { generateContentWithFallback, parseModelJson } from '@/lib/gemini';
import { prisma } from '@/lib/inventory';
import { invalidateInventoryCaches } from '@/lib/inventoryCache';
import { INITIAL_INVENTORY_ITEMS } from '@/lib/mockData';

// ============================================================================
// Types & Interfaces for Phase 3 Voice Logger + Fuzzy Product Matcher
// ============================================================================

export type VoiceTargetAction = 'PULL_RESCUE' | 'DISCARD';

export interface CatalogProductCandidate {
  id: string;
  name: string;
  barcode: string | null;
  department: Department;
  standardCost: number;
}

export interface FuzzyMatchCandidate {
  product_id: string;
  product_name: string;
  department: Department;
  similarity_score: number;
}

export interface StructuredVoiceLogItem {
  item_name: string;
  quantity: number;
  unit: string;
  condition: string;
  target_action: VoiceTargetAction;
  department: Department;
  product_id: string | null;
  matched_product_name: string | null;
  match_confidence: number;
  is_exact_match: boolean;
  requires_disambiguation: boolean;
  alternatives: FuzzyMatchCandidate[];
  allergen_warnings: string[];
}

export interface VoiceLoggerApiResponse {
  success: boolean;
  requires_confirmation: boolean; // Global Rule #4: Async Confirmation Loop
  transcript: string;
  item_name: string;
  quantity: number;
  condition: string;
  target_action: VoiceTargetAction;
  product_id: string | null;
  matched_product_name: string | null;
  match_confidence: number;
  items: StructuredVoiceLogItem[];
  // Preserved backward-compatible shape for existing UI components
  data: {
    transcript: string;
    targetAction: 'KITCHEN_RESCUE' | 'DISCARD';
    parsedItems: Array<{
      name: string;
      quantity: number;
      unit: string;
      department: 'PRODUCE' | 'DAIRY' | 'BAKERY' | 'PANTRY';
      condition: string;
      allergenWarnings: string[];
      productId?: string | null;
      matchedProductName?: string | null;
      matchConfidence?: number;
    }>;
    kitchenRescueNotes: string;
    estimatedWasteSavedValue: number;
  };
  timestamp: string;
}

// ============================================================================
// Fuzzy String Matching Utilities (Levenshtein + Token Overlap)
// ============================================================================

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(organic|fresh|ontario|mexico|canada|usa|loose|large|big|size|regular|whole)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function calculateSimilarityScore(spokenName: string, catalogName: string): number {
  const rawA = spokenName.toLowerCase().trim();
  const rawB = catalogName.toLowerCase().trim();
  if (rawA === rawB) return 1.0;

  const normA = normalizeText(spokenName);
  const normB = normalizeText(catalogName);
  if (!normA || !normB) return 0;
  if (normA === normB) return 0.98;

  // Substring containment boost
  const containsBoost =
    normB.includes(normA) || normA.includes(normB) ? 0.25 : 0;

  // Token overlap (Jaccard / Dice hybrid with singularization)
  const stem = (word: string) =>
    word.endsWith('es') && word.length > 4
      ? word.slice(0, -2)
      : word.endsWith('s') && word.length > 3
      ? word.slice(0, -1)
      : word;

  const tokensA = normA.split(' ').map(stem).filter(Boolean);
  const tokensB = normB.split(' ').map(stem).filter(Boolean);

  let matchedTokens = 0;
  for (const tA of tokensA) {
    if (tokensB.some((tB) => tB === tA || (tA.length >= 4 && tB.startsWith(tA)) || (tB.length >= 4 && tA.startsWith(tB)))) {
      matchedTokens++;
    }
  }

  const tokenScore =
    tokensA.length + tokensB.length > 0
      ? (2 * matchedTokens) / (tokensA.length + tokensB.length)
      : 0;

  const maxLen = Math.max(normA.length, normB.length);
  const editScore = maxLen > 0 ? 1 - levenshteinDistance(normA, normB) / maxLen : 0;

  const combined = Math.min(0.99, tokenScore * 0.65 + editScore * 0.35 + containsBoost);
  return Number(combined.toFixed(2));
}

async function loadProductCatalog(): Promise<CatalogProductCandidate[]> {
  try {
    const dbProducts = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        barcode: true,
        department: true,
        standardCost: true,
      },
    });

    if (dbProducts.length > 0) {
      return dbProducts.map((p) => ({
        id: p.id,
        name: p.name,
        barcode: p.barcode,
        department: p.department,
        standardCost: p.standardCost ?? 2.5,
      }));
    }
  } catch {
    // Fallback to mock catalog when DB is offline
  }

  return INITIAL_INVENTORY_ITEMS.map((item) => ({
    id: item.id,
    name: item.name,
    barcode: item.barcode ?? null,
    department: item.department as Department,
    standardCost: Number((item.receivedCost / (item.casePackSize || 1)).toFixed(2)),
  }));
}

function matchSpokenItemToCatalog(
  spokenItemName: string,
  catalog: CatalogProductCandidate[]
): {
  bestMatch: CatalogProductCandidate | null;
  confidence: number;
  isExact: boolean;
  alternatives: FuzzyMatchCandidate[];
} {
  const scored = catalog
    .map((candidate) => ({
      candidate,
      score: calculateSimilarityScore(spokenItemName, candidate.name),
    }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const isExact =
    top !== undefined &&
    top.candidate.name.toLowerCase().trim() === spokenItemName.toLowerCase().trim();

  const bestMatch = top && top.score >= 0.35 ? top.candidate : null;
  const confidence = bestMatch ? top.score : 0;

  const alternatives: FuzzyMatchCandidate[] = scored
    .filter((entry) => entry.score >= 0.3)
    .slice(0, 3)
    .map((entry) => ({
      product_id: entry.candidate.id,
      product_name: entry.candidate.name,
      department: entry.candidate.department,
      similarity_score: entry.score,
    }));

  return {
    bestMatch,
    confidence,
    isExact,
    alternatives,
  };
}

// ============================================================================
// Multimodal voice parser (shared Gemini transport + deterministic fallback)
// ============================================================================

const VOICE_FLOOR_LOGGER_PROMPT = `You are the FreshLoop AI Voice Floor Logger for an independent supermarket.
Analyze the spoken audio or text transcript from floor/kitchen staff and return ONLY valid JSON with this exact structure:
{
  "transcript": "verbatim transcript of what was spoken",
  "notes": "brief actionable summary for kitchen or floor",
  "items": [
    {
      "item_name": "string (product name mentioned)",
      "quantity": number,
      "unit": "lbs" | "kg" | "units" | "cases" | "loaves" | "L" | "bunches" | "tubs",
      "condition": "Overripe" | "Bruised" | "Slightly Blemished" | "Near Expiry" | "Spoiled" | "Crushed",
      "target_action": "PULL_RESCUE" | "DISCARD",
      "department": "PRODUCE" | "DAIRY" | "BAKERY" | "PANTRY",
      "allergen_warnings": ["string"]
    }
  ]
}

Strict classification rules:
- target_action MUST be either "PULL_RESCUE" (if edible/usable for kitchen prep such as overripe, bruised, near expiry, day-old) or "DISCARD" (if spoiled, moldy, crushed, contaminated, or unsafe).
- Always extract numeric quantity > 0.`;

function mapVoiceParserItems(items: Record<string, unknown>[]) {
  return items.map((item) => ({
    item_name: String(item.item_name || item.name || 'Unknown Item'),
    quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
    unit: String(item.unit || 'units'),
    condition: String(item.condition || 'Overripe'),
    target_action: (item.target_action === 'DISCARD' ? 'DISCARD' : 'PULL_RESCUE') as VoiceTargetAction,
    department: (['PRODUCE', 'DAIRY', 'BAKERY', 'PANTRY'].includes(String(item.department))
      ? String(item.department)
      : 'PRODUCE') as Department,
    allergen_warnings: Array.isArray(item.allergen_warnings)
      ? item.allergen_warnings.map(String)
      : [],
  }));
}

async function parseVoiceWithGemini15Flash(
  audioBase64?: string,
  mimeType: string = 'audio/webm',
  spokenText?: string
): Promise<{
  transcript: string;
  items: Array<{
    item_name: string;
    quantity: number;
    unit: string;
    condition: string;
    target_action: VoiceTargetAction;
    department: Department;
    allergen_warnings: string[];
  }>;
  notes: string;
}> {
  const prompt =
    VOICE_FLOOR_LOGGER_PROMPT +
    (spokenText ? `\n\nSpoken Input Transcript: "${spokenText}"` : '');

  const cleanBase64 = audioBase64
    ? audioBase64.includes(',')
      ? audioBase64.split(',')[1]
      : audioBase64
    : '';

  try {
    const { text } = await generateContentWithFallback(
      prompt,
      cleanBase64 ? { data: cleanBase64, mimeType: mimeType || 'audio/webm' } : undefined,
      ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']
    );

    const parsed = parseModelJson<{
      transcript?: string;
      notes?: string;
      items?: Record<string, unknown>[];
    }>(text);

    if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
      return {
        transcript: parsed.transcript || spokenText || 'Audio log processed',
        notes:
          parsed.notes ||
          'Pending human confirmation before committing to Inventory_Transactions.',
        items: mapVoiceParserItems(parsed.items),
      };
    }
  } catch (err) {
    console.warn(
      '[voice-logger] Gemini parse fell back to deterministic parser:',
      err instanceof Error ? err.message : String(err)
    );
  }

  // Deterministic intelligent fallback parser when offline or model unavailable
  const rawTranscript =
    spokenText?.trim() || 'Logged 10 lbs bruised apples and 4L heavy cream';
  const lower = rawTranscript.toLowerCase();
  const isDiscard =
    lower.includes('discard') ||
    lower.includes('spoiled') ||
    lower.includes('mold') ||
    lower.includes('trash') ||
    lower.includes('waste') ||
    lower.includes('rotten') ||
    lower.includes('crushed') ||
    lower.includes('basura') ||
    lower.includes('descarte');

  const segments = rawTranscript
    .split(/\band\b|\by\b|,/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const parsedFallbackItems = segments.map((seg) => {
    const qtyMatch = seg.match(/(\d+(?:\.\d+)?)\s*(lbs?|kg|liters?|l|units?|cases?|loaves?|bunches|tubs)?/i);
    const quantity = qtyMatch ? Number(qtyMatch[1]) : 1;
    const unit = qtyMatch?.[2] || 'units';

    const cleanedName = seg
      .replace(/^(logged|log|pull|transfer|discard|rescued|retirar|registrar)\s+/i, '')
      .replace(/(\d+(?:\.\d+)?)\s*(lbs?|kg|liters?|l|units?|cases?|loaves?|bunches|tubs)?\s*(of\s+|de\s+)?/i, '')
      .replace(/\b(bruised|overripe|spoiled|rotten|crushed|near expiry|slightly blemished)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    const segLower = seg.toLowerCase();
    let condition = 'Overripe';
    if (segLower.includes('bruised')) condition = 'Bruised';
    else if (segLower.includes('spoiled') || segLower.includes('rotten')) condition = 'Spoiled';
    else if (segLower.includes('crushed')) condition = 'Crushed';
    else if (segLower.includes('expiry') || segLower.includes('short')) condition = 'Near Expiry';

    let department: Department = Department.PRODUCE;
    const allergens: string[] = [];
    if (segLower.includes('cream') || segLower.includes('milk') || segLower.includes('yogurt') || segLower.includes('cheese')) {
      department = Department.DAIRY;
      allergens.push('Milk / Dairy');
    } else if (segLower.includes('bread') || segLower.includes('sourdough') || segLower.includes('boule') || segLower.includes('loaf')) {
      department = Department.BAKERY;
      allergens.push('Wheat / Gluten');
    } else if (segLower.includes('oil') || segLower.includes('olive')) {
      department = Department.PANTRY;
    }

    const segDiscard =
      isDiscard ||
      segLower.includes('spoiled') ||
      segLower.includes('rotten') ||
      segLower.includes('mold') ||
      segLower.includes('discard');

    return {
      item_name: cleanedName || 'Honey Crisp Apples',
      quantity,
      unit,
      condition,
      target_action: (segDiscard ? 'DISCARD' : 'PULL_RESCUE') as VoiceTargetAction,
      department,
      allergen_warnings: allergens,
    };
  });

  return {
    transcript: rawTranscript,
    notes:
      'Parsed by FreshLoop Voice Engine. Ready for human confirmation [CONFIRMAR / EDITAR].',
    items: parsedFallbackItems,
  };
}

// ============================================================================
// POST /api/voice-logger
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      audioBase64,
      mimeType,
      spokenText,
      confirmCommit,
      confirmedItems,
      staffId,
    } = body as {
      audioBase64?: string;
      mimeType?: string;
      spokenText?: string;
      confirmCommit?: boolean;
      confirmedItems?: Array<{
        product_id: string;
        quantity: number;
        target_action: VoiceTargetAction;
        condition?: string;
      }>;
      staffId?: string;
    };

    // ------------------------------------------------------------------------
    // Optional Step 2 of Async Confirmation Loop:
    // Only writes to InventoryTransaction when the user explicitly confirms
    // in the [CONFIRMAR] / [EDITAR] UI modal (`confirmCommit: true`).
    // ------------------------------------------------------------------------
    if (confirmCommit && Array.isArray(confirmedItems) && confirmedItems.length > 0) {
      const invalid = confirmedItems.find(
        (item) => !item.product_id?.trim() || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0
      );
      if (invalid) {
        return NextResponse.json(
          {
            success: false,
            error: 'Each confirmed item needs a product_id and a positive quantity.',
          },
          { status: 400 }
        );
      }

      const committedTransactions = await prisma.$transaction(
        confirmedItems.flatMap((item) => {
          const absQty = Math.abs(Number(item.quantity) || 1);
          const actor = staffId || 'staff-voice-floor';
          const refId = `VOICE-CONFIRM-${Date.now()}`;

          if (item.target_action === 'DISCARD') {
            return [
              prisma.inventoryTransaction.create({
                data: {
                  productId: item.product_id,
                  staffId: actor,
                  qtyChange: -absQty,
                  transactionType: TransactionType.Waste,
                  fromLocation: InventoryLocation.Retail_Floor,
                  toLocation: InventoryLocation.Waste_Bin,
                  unitCostAtTime: 2.0,
                  referenceId: refId,
                  notes: `Confirmed Voice Logger Discard (${item.condition || 'Spoiled'})`,
                },
              }),
            ];
          }

          // PULL_RESCUE: Double-entry transfer from Retail_Floor -> Kitchen_Prep
          return [
            prisma.inventoryTransaction.create({
              data: {
                productId: item.product_id,
                staffId: actor,
                qtyChange: -absQty,
                transactionType: TransactionType.Rescue,
                fromLocation: InventoryLocation.Retail_Floor,
                toLocation: InventoryLocation.Kitchen_Prep,
                unitCostAtTime: 2.0,
                referenceId: refId,
                notes: `Confirmed Voice Rescue Outflow (${item.condition || 'Overripe'})`,
              },
            }),
            prisma.inventoryTransaction.create({
              data: {
                productId: item.product_id,
                staffId: actor,
                qtyChange: absQty,
                transactionType: TransactionType.Rescue,
                fromLocation: InventoryLocation.Retail_Floor,
                toLocation: InventoryLocation.Kitchen_Prep,
                unitCostAtTime: 2.0,
                referenceId: refId,
                notes: `Confirmed Voice Rescue Inflow to Kitchen Prep`,
              },
            }),
          ];
        })
      );
      invalidateInventoryCaches();

      return NextResponse.json({
        success: true,
        committed: true,
        transactionsCreated: committedTransactions.length,
        transactions: committedTransactions,
        timestamp: new Date().toISOString(),
      });
    }

    // ------------------------------------------------------------------------
    // Step 1 (Default): Parse Audio/Text + Fuzzy Match against Product Catalog
    // NEVER writes directly to DB (Global Rule #4: Async Confirmation Loop).
    // ------------------------------------------------------------------------
    const [aiParsed, catalog] = await Promise.all([
      parseVoiceWithGemini15Flash(audioBase64, mimeType || 'audio/webm', spokenText),
      loadProductCatalog(),
    ]);

    const structuredItems: StructuredVoiceLogItem[] = aiParsed.items.map((item) => {
      const match = matchSpokenItemToCatalog(item.item_name, catalog);
      return {
        item_name: item.item_name,
        quantity: item.quantity,
        unit: item.unit,
        condition: item.condition,
        target_action: item.target_action,
        department: match.bestMatch?.department ?? item.department,
        product_id: match.bestMatch?.id ?? null,
        matched_product_name: match.bestMatch?.name ?? null,
        match_confidence: match.confidence,
        is_exact_match: match.isExact,
        requires_disambiguation: !match.isExact && match.confidence < 0.85,
        alternatives: match.alternatives,
        allergen_warnings: item.allergen_warnings,
      };
    });

    const primaryItem = structuredItems[0] ?? {
      item_name: 'Unknown Item',
      quantity: 1,
      unit: 'units',
      condition: 'Overripe',
      target_action: 'PULL_RESCUE' as VoiceTargetAction,
      department: Department.PRODUCE,
      product_id: null,
      matched_product_name: null,
      match_confidence: 0,
      is_exact_match: false,
      requires_disambiguation: true,
      alternatives: [],
      allergen_warnings: [],
    };

    const estimatedSavedValue = Number(
      structuredItems
        .reduce((acc, item) => acc + item.quantity * 3.25, 0)
        .toFixed(2)
    );

    const responsePayload: VoiceLoggerApiResponse = {
      success: true,
      requires_confirmation: true, // Enforce [CONFIRMAR] / [EDITAR] modal workflow
      transcript: aiParsed.transcript,
      item_name: primaryItem.matched_product_name || primaryItem.item_name,
      quantity: primaryItem.quantity,
      condition: primaryItem.condition,
      target_action: primaryItem.target_action,
      product_id: primaryItem.product_id,
      matched_product_name: primaryItem.matched_product_name,
      match_confidence: primaryItem.match_confidence,
      items: structuredItems,
      data: {
        transcript: aiParsed.transcript,
        targetAction:
          primaryItem.target_action === 'DISCARD' ? 'DISCARD' : 'KITCHEN_RESCUE',
        parsedItems: structuredItems.map((it) => ({
          name: it.matched_product_name
            ? `${it.matched_product_name} (Spoken: "${it.item_name}")`
            : it.item_name,
          quantity: it.quantity,
          unit: it.unit,
          department: (it.department === 'DELI_KITCHEN'
            ? 'PRODUCE'
            : it.department) as 'PRODUCE' | 'DAIRY' | 'BAKERY' | 'PANTRY',
          condition: it.condition,
          allergenWarnings: it.allergen_warnings,
          productId: it.product_id,
          matchedProductName: it.matched_product_name,
          matchConfidence: it.match_confidence,
        })),
        kitchenRescueNotes: aiParsed.notes,
        estimatedWasteSavedValue: estimatedSavedValue,
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(responsePayload);
  } catch (error: unknown) {
    console.error('API Error in /api/voice-logger:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to process voice floor log',
      },
      { status: 500 }
    );
  }
}
