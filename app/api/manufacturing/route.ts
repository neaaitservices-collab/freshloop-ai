import { NextRequest, NextResponse } from 'next/server';
import type {
  InventoryLocation,
  TransactionType,
  UnitType,
  InventoryTransaction,
} from '@prisma/client';
import {
  prisma,
  getMovingAverageCost,
  getCurrentStock,
  InventoryLedgerError,
} from '@/lib/domains/inventory/ledger';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import { consumeLotsFifo, createLotOnReceive } from '@/lib/domains/inventory/lots';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireRoles } from '@/lib/auth/session';
import { MANUFACTURING_ROLES } from '@/lib/auth/permissions';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { manufacturingPostBodySchema } from '@/lib/security/schemas/manufacturing';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';
import { buildManufacturingRecipeCatalog } from '@/lib/domains/manufacturing/buildCatalog';
import { resolveExecutionLaborRate } from '@/lib/auth/staffHourlyRate';
import { findLatestStoreSetting } from '@/lib/domains/stats/storeSettingSelect';
import { computeScaledBatchCost } from '@/lib/domains/manufacturing/batchCost';
import {
  FALLBACK_RECIPES,
  resolveManufacturingRecipeId,
  type FallbackRecipeCatalogEntry,
} from '@/lib/domains/manufacturing/fallbackRecipes';

// ============================================================================
// Types & Interfaces for Phase 3 Kitchen Manufacturing Engine
// ============================================================================

export interface IngredientVarianceOverride {
  ingredient_product_id: string;
  actual_qty_used: number;
}

export interface ManufacturingRequestBody {
  recipe_id: string;
  /** Number of finished output units/portions produced in this batch (e.g. 20 tubs) */
  batch_output: number;
  /** Role-Based Access Control (Global Rule #5: Restricted to Kitchen Staff) */
  staff_role?: string;
  staff_id?: string;
  /** Optional real-weight variance overrides from Phase 5 RecipeProductionModal */
  ingredient_overrides?: IngredientVarianceOverride[];
  enforce_stock_check?: boolean;
  notes?: string;
}

export interface ManufacturedIngredientConsumption {
  ingredient_product_id: string;
  ingredient_name: string;
  unit: UnitType;
  bom_standard_qty: number;
  actual_qty_deducted: number;
  variance_qty: number;
  moving_average_unit_cost: number;
  ingredient_line_cost: number;
  ledger_transaction_id: string;
}

export interface ManufacturingExecutionResponse {
  success: boolean;
  batch_reference_id: string;
  recipe_id: string;
  recipe_name: string;
  output_product_id: string;
  output_product_name: string;
  location: InventoryLocation;
  standard_batch_yield: number;
  actual_batch_output: number;
  total_batch_cost: number;
  unit_output_cost: number;
  target_retail_price: number;
  projected_gross_margin_pct: number;
  ingredients_consumed: ManufacturedIngredientConsumption[];
  output_transaction: InventoryTransaction;
  executed_by_staff_id: string;
  executed_by_role: string;
  timestamp: string;
}

const LOC_KITCHEN_PREP = 'Kitchen_Prep' as InventoryLocation;
const LOC_DELI = 'Deli_Grab_N_Go' as InventoryLocation;
const TX_RESCUE = 'Rescue' as TransactionType;
const TX_RECEIVE = 'Receive' as TransactionType;

// ============================================================================
// GET /api/manufacturing — live BOM catalog (Kitchen_Prep stock + MAC)
// ============================================================================

export async function GET() {
  try {
    await requireRoles(MANUFACTURING_ROLES);
    const recipes = await buildManufacturingRecipeCatalog();
    return NextResponse.json({ success: true, recipes });
  } catch (error: unknown) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Could not load recipe catalog.');
  }
}

// ============================================================================
// POST /api/manufacturing
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const actor = await requireRoles(MANUFACTURING_ROLES);
    const limited = assertMutationRateLimit(actor.id, 'manufacturing-batch', 15);
    if (limited) return limited;

    const parsed = await parseJsonBody(req, manufacturingPostBodySchema);
    const body: ManufacturingRequestBody = {
      recipe_id: parsed.recipe_id,
      batch_output: parsed.batch_output,
      ingredient_overrides: parsed.ingredient_overrides?.map((row) => ({
        ingredient_product_id: row.ingredient_product_id,
        actual_qty_used: row.actual_qty_used,
      })),
      enforce_stock_check: parsed.enforce_stock_check,
      notes: parsed.notes,
    };

    const effectiveRole = actor.role;
    const staffId = actor.id;

    const recipeId = resolveManufacturingRecipeId(body.recipe_id);
    const batchOutput = body.batch_output;

    if (!recipeId) {
      return NextResponse.json(
        {
          success: false,
          code: 'MISSING_RECIPE_ID',
          error: 'Parameter "recipe_id" is required.',
        },
        { status: 400 }
      );
    }

    // Query Recipe + RecipeBOM + Output Product (with fallback to seeded catalog if DB is unavailable)
    let resolvedRecipe: FallbackRecipeCatalogEntry | null = null;
    let recipeLaborHours = 0;
    let recipeLaborRateFromDb: number | null = null;
    let recipePackagingPerUnit = 0;
    try {
      const dbRecipe = await prisma.recipe?.findUnique({
        where: { id: recipeId },
        include: {
          outputProduct: true,
          bomLines: {
            include: {
              ingredientProduct: true,
            },
          },
        },
      });
      if (dbRecipe) {
        recipeLaborHours = Number(dbRecipe.laborHours ?? 0);
        recipeLaborRateFromDb =
          dbRecipe.laborRate != null && Number(dbRecipe.laborRate) > 0
            ? Number(dbRecipe.laborRate)
            : null;
        recipePackagingPerUnit = Number(dbRecipe.packagingCostPerUnit ?? 0);
        resolvedRecipe = {
          id: dbRecipe.id,
          aliases: [],
          name: dbRecipe.name,
          outputProductId: dbRecipe.outputProductId,
          outputProductName: dbRecipe.outputProduct.name,
          outputUnit: dbRecipe.outputProduct.unitType,
          outputShelfLifeDays: dbRecipe.outputProduct.shelfLifeDays || 3,
          batchYieldQty: Number(dbRecipe.yieldPortions ?? 0),
          targetRetailPrice: Number(dbRecipe.targetRetailPrice ?? 0),
          isActive: dbRecipe.status !== 'COMPLETED',
          bomItems: dbRecipe.bomLines.map((bi) => ({
            ingredientProductId: bi.ingredientProductId,
            ingredientName: bi.ingredientProduct.name,
            requiredQty: Number(bi.quantityRequired ?? 0),
            unit: (bi.unit as UnitType) ?? ('UNIT' as UnitType),
            allowVariance: true,
            defaultMacCost: bi.ingredientProduct.standardCost ?? 2.0,
          })),
        };
      }
    } catch {
      // Fall back to seeded catalog when DB connection is offline
    }

    if (!resolvedRecipe) {
      resolvedRecipe =
        FALLBACK_RECIPES.find(
          (r) => r.id === recipeId || r.aliases.includes(recipeId)
        ) || null;
    }

    if (!resolvedRecipe) {
      return NextResponse.json(
        {
          success: false,
          code: 'RECIPE_NOT_FOUND',
          error: `Recipe "${recipeId}" was not found in the database.`,
        },
        { status: 404 }
      );
    }

    if (!resolvedRecipe.isActive) {
      return NextResponse.json(
        {
          success: false,
          code: 'RECIPE_INACTIVE',
          error: `Recipe "${resolvedRecipe.name}" is currently marked inactive.`,
        },
        { status: 422 }
      );
    }

    if (resolvedRecipe.bomItems.length === 0) {
      return NextResponse.json(
        {
          success: false,
          code: 'EMPTY_RECIPE_BOM',
          error: `Recipe "${resolvedRecipe.name}" has no RecipeBOM ingredients configured.`,
        },
        { status: 422 }
      );
    }

    // Scaling factor if batch_output differs from standard recipe.batchYieldQty
    const standardYield =
      resolvedRecipe.batchYieldQty > 0 ? resolvedRecipe.batchYieldQty : batchOutput;
    const batchScaleRatio = batchOutput / standardYield;

    // Map optional cook variance overrides (Phase 5 support)
    const overrideMap = new Map<string, number>();
    if (Array.isArray(body.ingredient_overrides)) {
      for (const ov of body.ingredient_overrides) {
        if (
          ov &&
          typeof ov.ingredient_product_id === 'string' &&
          Number.isFinite(Number(ov.actual_qty_used)) &&
          Number(ov.actual_qty_used) >= 0
        ) {
          overrideMap.set(ov.ingredient_product_id.trim(), Number(ov.actual_qty_used));
        }
      }
    }

    // 4. Calculate ingredient consumption & Moving Average Cost for each BOM line
    const consumptionPlan: Array<{
      ingredientProductId: string;
      ingredientName: string;
      unit: UnitType;
      bomStandardQty: number;
      actualQtyToDeduct: number;
      varianceQty: number;
      unitMovingAvgCost: number;
      lineCost: number;
    }> = [];

    for (const bomItem of resolvedRecipe.bomItems) {
      const scaledStandardQty = Number(
        (bomItem.requiredQty * batchScaleRatio).toFixed(4)
      );

      const hasOverride = overrideMap.has(bomItem.ingredientProductId);
      if (hasOverride && !bomItem.allowVariance) {
        return NextResponse.json(
          {
            success: false,
            code: 'VARIANCE_NOT_ALLOWED',
            error: `Ingredient "${bomItem.ingredientName}" does not allow BOM quantity variance.`,
          },
          { status: 422 }
        );
      }

      const actualQtyToDeduct = hasOverride
        ? Number(overrideMap.get(bomItem.ingredientProductId)!.toFixed(4))
        : scaledStandardQty;

      // Optional stock check in Kitchen_Prep
      if (body.enforce_stock_check) {
        try {
          const currentKitchenStock = await getCurrentStock(
            bomItem.ingredientProductId,
            LOC_KITCHEN_PREP
          );
          if (currentKitchenStock < actualQtyToDeduct) {
            return NextResponse.json(
              {
                success: false,
                code: 'INSUFFICIENT_KITCHEN_PREP_STOCK',
                error: `Insufficient stock in production prep for "${bomItem.ingredientName}": required ${actualQtyToDeduct}, available ${currentKitchenStock}.`,
              },
              { status: 409 }
            );
          }
        } catch {
          // Continue in demo mode when DB is offline
        }
      }

      let unitMovingAvgCost = bomItem.defaultMacCost;
      try {
        const dbMac = await getMovingAverageCost(bomItem.ingredientProductId);
        if (dbMac > 0) unitMovingAvgCost = dbMac;
      } catch {
        // Keep seeded default MAC cost
      }

      const lineCost = Number((actualQtyToDeduct * unitMovingAvgCost).toFixed(4));
      const varianceQty = Number(
        (actualQtyToDeduct - scaledStandardQty).toFixed(4)
      );

      consumptionPlan.push({
        ingredientProductId: bomItem.ingredientProductId,
        ingredientName: bomItem.ingredientName,
        unit: bomItem.unit,
        bomStandardQty: scaledStandardQty,
        actualQtyToDeduct,
        varianceQty,
        unitMovingAvgCost,
        lineCost,
      });
    }

    // 5. Compute Total Batch Cost (ingredients + labor + packaging) and unit cost
    const ingredientBatchCost = Number(
      consumptionPlan.reduce((sum, item) => sum + item.lineCost, 0).toFixed(4)
    );
    const laborFromFallback = resolvedRecipe.laborHours ?? recipeLaborHours;
    const executionLaborRate = await resolveExecutionLaborRate(
      staffId,
      resolvedRecipe.laborRatePerHour ?? recipeLaborRateFromDb
    );
    const packagingFromFallback =
      resolvedRecipe.packagingCostPerUnit ?? recipePackagingPerUnit;

    const costBreakdown = computeScaledBatchCost({
      ingredientCost: ingredientBatchCost,
      laborHours: laborFromFallback,
      laborRatePerHour: executionLaborRate,
      packagingCostPerUnit: packagingFromFallback,
      standardYield,
      actualBatchOutput: batchOutput,
    });
    const totalBatchCost = costBreakdown.totalBatchCost;
    const unitOutputCost = costBreakdown.unitCost;
    const batchReferenceId = `MFG-${resolvedRecipe.id.slice(0, 8).toUpperCase()}-${Date.now()}`;

    const expirationDate = new Date(
      Date.now() +
        (resolvedRecipe.outputShelfLifeDays || 3) * 24 * 60 * 60 * 1000
    );

    // 6. Execute Atomic Prisma Transaction:
    //    a) Deduct each raw ingredient from `Kitchen_Prep` (negative Qty_Change)
    //    b) Register the finished output product in `Kitchen_Prep` (positive Qty_Change = batch_output)
    let ingredientTransactions: InventoryTransaction[];
    let outputTransaction: InventoryTransaction;

    try {
      const recipeForBatch = resolvedRecipe;
      const ledgerResults = await prisma.$transaction(async (tx) => {
        const ingredientRows: InventoryTransaction[] = [];
        for (const item of consumptionPlan) {
          const qty = Number(Math.abs(item.actualQtyToDeduct).toFixed(4));
          if (qty > 0) {
            await consumeLotsFifo(tx, {
              productId: item.ingredientProductId,
              location: LOC_KITCHEN_PREP,
              qty,
              allowShort: true,
            });
          }
          ingredientRows.push(
            await tx.inventoryTransaction.create({
              data: {
                productId: item.ingredientProductId,
                staffId,
                qtyChange: -Math.abs(item.actualQtyToDeduct),
                transactionType: TX_RESCUE,
                fromLocation: LOC_KITCHEN_PREP,
                toLocation: LOC_KITCHEN_PREP,
                unitCostAtTime: item.unitMovingAvgCost,
                referenceId: batchReferenceId,
                notes: `BOM Consumption for "${recipeForBatch.name}" (${item.actualQtyToDeduct} ${item.unit})`,
              },
            })
          );
        }

        const outputRow = await tx.inventoryTransaction.create({
          data: {
            productId: recipeForBatch.outputProductId,
            staffId,
            qtyChange: Math.abs(batchOutput),
            transactionType: TX_RECEIVE,
            fromLocation: LOC_KITCHEN_PREP,
            toLocation: LOC_DELI,
            unitCostAtTime: unitOutputCost,
            referenceId: batchReferenceId,
            expirationDate,
            notes:
              body.notes ||
              `Manufactured ${batchOutput} units of "${recipeForBatch.outputProductName}" → Deli Grab-n-Go (Batch: $${totalBatchCost.toFixed(
                2
              )}, labor $${costBreakdown.laborCost.toFixed(2)}, packaging $${costBreakdown.packagingCost.toFixed(2)})`,
          },
        });
        await createLotOnReceive(tx, {
          productId: recipeForBatch.outputProductId,
          location: LOC_DELI,
          qty: Math.abs(batchOutput),
          unitCostAtTime: unitOutputCost,
          expirationDate,
          receiveReferenceId: batchReferenceId,
          receiveTransactionId: outputRow.id,
        });
        await tx.product.update({
          where: { id: recipeForBatch.outputProductId },
          data: {
            isManufactured: true,
            department: 'DELI_KITCHEN',
            standardCost: unitOutputCost,
            ...(recipeForBatch.targetRetailPrice > 0
              ? { retailPrice: recipeForBatch.targetRetailPrice }
              : {}),
          },
        });
        return { ingredientRows, outputRow };
      });

      ingredientTransactions = ledgerResults.ingredientRows;
      outputTransaction = ledgerResults.outputRow;
      invalidateInventoryCaches();
    } catch (ledgerError) {
      throw new InventoryLedgerError(
        ledgerError instanceof Error
          ? ledgerError.message
          : 'Manufacturing batch could not be written to the ledger.',
        'MFG_LEDGER_FAILED',
        500
      );
    }

    const ingredientsConsumed: ManufacturedIngredientConsumption[] =
      consumptionPlan.map((item, idx) => ({
        ingredient_product_id: item.ingredientProductId,
        ingredient_name: item.ingredientName,
        unit: item.unit,
        bom_standard_qty: item.bomStandardQty,
        actual_qty_deducted: item.actualQtyToDeduct,
        variance_qty: item.varianceQty,
        moving_average_unit_cost: item.unitMovingAvgCost,
        ingredient_line_cost: Number(item.lineCost.toFixed(2)),
        ledger_transaction_id: ingredientTransactions[idx].id,
      }));

    const projectedGrossMarginPct =
      resolvedRecipe.targetRetailPrice > 0
        ? Number(
            (
              ((resolvedRecipe.targetRetailPrice - unitOutputCost) /
                resolvedRecipe.targetRetailPrice) *
              100
            ).toFixed(2)
          )
        : 0;

    const response: ManufacturingExecutionResponse = {
      success: true,
      batch_reference_id: batchReferenceId,
      recipe_id: resolvedRecipe.id,
      recipe_name: resolvedRecipe.name,
      output_product_id: resolvedRecipe.outputProductId,
      output_product_name: resolvedRecipe.outputProductName,
      location: LOC_DELI,
      standard_batch_yield: resolvedRecipe.batchYieldQty,
      actual_batch_output: batchOutput,
      total_batch_cost: Number(totalBatchCost.toFixed(2)),
      unit_output_cost: Number(unitOutputCost.toFixed(2)),
      target_retail_price: resolvedRecipe.targetRetailPrice,
      projected_gross_margin_pct: projectedGrossMarginPct,
      ingredients_consumed: ingredientsConsumed,
      output_transaction: outputTransaction,
      executed_by_staff_id: staffId,
      executed_by_role: effectiveRole,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    if (error instanceof InventoryLedgerError) {
      return NextResponse.json(
        {
          success: false,
          code: error.code,
          error: error.message,
        },
        { status: error.statusCode }
      );
    }
    return apiErrorFromUnknown(
      error,
      'Failed to execute production recipe manufacturing batch.'
    );
  }
}
