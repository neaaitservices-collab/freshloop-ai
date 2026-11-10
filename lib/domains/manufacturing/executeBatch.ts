import { createHash } from 'node:crypto';
import type { InventoryLocation, InventoryTransaction, Prisma, TransactionType, UnitType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { InventoryLedgerError, getMovingAverageCost } from '@/lib/domains/inventory/ledger';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import { LotAllocationError, consumeLotsFifo, createLotOnReceive } from '@/lib/domains/inventory/lots';
import { resolveExecutionLaborRate } from '@/lib/auth/staffHourlyRate';
import { computeScaledBatchCost } from '@/lib/domains/manufacturing/batchCost';
import {
  isFallbackRecipeId,
  type FallbackRecipeCatalogEntry,
} from '@/lib/domains/manufacturing/fallbackRecipes';
import {
  manufacturingPayloadKey,
  type ManufacturingPayloadInput,
} from '@/lib/domains/manufacturing/manufacturingPayload';

const LOC_KITCHEN_PREP = 'Kitchen_Prep' as InventoryLocation;
const LOC_DELI = 'Deli_Grab_N_Go' as InventoryLocation;
const TX_RESCUE = 'Rescue' as TransactionType;
const TX_RECEIVE = 'Receive' as TransactionType;

const OPERATION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ManufacturingRequestError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = 'ManufacturingRequestError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ManufacturingOperationConflictError extends Error {
  readonly code = 'MANUFACTURING_OPERATION_CONFLICT';
  readonly statusCode = 409;

  constructor() {
    super('This production id is already in use. Submit again to start a separate batch.');
    this.name = 'ManufacturingOperationConflictError';
  }
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

export interface ManufacturingExecutionResult {
  success: true;
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

export interface ExecuteManufacturingBatchInput {
  operationId: string;
  staffId: string;
  staffRole: string;
  recipeId: string;
  batchOutput: number;
  ingredientOverrides?: ManufacturingPayloadInput['ingredient_overrides'];
  enforceStockCheck?: boolean;
  notes?: string;
}

export interface ManufacturingBatchOutcome {
  idempotent: boolean;
  result: ManufacturingExecutionResult;
}

export function manufacturingPayloadHash(input: ManufacturingPayloadInput): string {
  return createHash('sha256').update(manufacturingPayloadKey(input)).digest('hex');
}

export function manufacturingBatchReferenceId(operationId: string): string {
  return `MFG-${operationId}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

function isExecutionResult(value: unknown): value is ManufacturingExecutionResult {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<ManufacturingExecutionResult>;
  return row.success === true && typeof row.batch_reference_id === 'string';
}

function payloadFromInput(input: ExecuteManufacturingBatchInput): ManufacturingPayloadInput {
  return {
    recipe_id: input.recipeId,
    batch_output: input.batchOutput,
    ingredient_overrides: input.ingredientOverrides,
    enforce_stock_check: input.enforceStockCheck,
    notes: input.notes,
  };
}

function storedStaffId(result: ManufacturingExecutionResult): string {
  return typeof result.executed_by_staff_id === 'string' ? result.executed_by_staff_id.trim() : '';
}

async function replayCompletedOperation(
  operationId: string,
  payloadHash: string,
  staffId: string
): Promise<ManufacturingBatchOutcome> {
  const existing = await prisma.manufacturingOperation.findUnique({
    where: { id: operationId },
  });
  if (!existing) {
    throw new InventoryLedgerError(
      'Manufacturing batch could not be written to the ledger.',
      'MFG_LEDGER_FAILED',
      500
    );
  }
  if (existing.payloadHash !== payloadHash) {
    throw new ManufacturingOperationConflictError();
  }
  if (!isExecutionResult(existing.response)) {
    throw new InventoryLedgerError(
      'Manufacturing batch could not be written to the ledger.',
      'MFG_LEDGER_FAILED',
      500
    );
  }
  if (!storedStaffId(existing.response) || storedStaffId(existing.response) !== staffId.trim()) {
    throw new ManufacturingOperationConflictError();
  }
  return { idempotent: true, result: existing.response };
}

export async function executeManufacturingBatch(
  input: ExecuteManufacturingBatchInput
): Promise<ManufacturingBatchOutcome> {
  const operationId = input.operationId.trim();
  if (!OPERATION_ID_RE.test(operationId)) {
    throw new ManufacturingRequestError(
      'operation_id must be a UUID.',
      'INVALID_OPERATION_ID',
      400
    );
  }

  const payload = payloadFromInput({ ...input, operationId });
  const payloadHash = manufacturingPayloadHash(payload);
  const recipeId = payload.recipe_id.trim();
  const batchOutput = payload.batch_output;

  if (!recipeId) {
    throw new ManufacturingRequestError(
      'Parameter "recipe_id" is required.',
      'MISSING_RECIPE_ID',
      400
    );
  }

  if (isFallbackRecipeId(recipeId)) {
    throw new ManufacturingRequestError('Recipe not found', 'RECIPE_NOT_FOUND', 404);
  }

  const dbRecipe = await prisma.recipe.findUnique({
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

  if (!dbRecipe) {
    throw new ManufacturingRequestError('Recipe not found', 'RECIPE_NOT_FOUND', 404);
  }

  const recipeLaborHours = Number(dbRecipe.laborHours ?? 0);
  const recipeLaborRateFromDb =
    dbRecipe.laborRate != null && Number(dbRecipe.laborRate) > 0
      ? Number(dbRecipe.laborRate)
      : null;
  const recipePackagingPerUnit = Number(dbRecipe.packagingCostPerUnit ?? 0);
  const resolvedRecipe: FallbackRecipeCatalogEntry = {
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
      allowVariance: bi.allowVariance,
      defaultMacCost: bi.ingredientProduct.standardCost ?? 2.0,
    })),
  };

  if (!resolvedRecipe.isActive) {
    throw new ManufacturingRequestError(
      `Recipe "${resolvedRecipe.name}" is currently marked inactive.`,
      'RECIPE_INACTIVE',
      422
    );
  }

  if (resolvedRecipe.bomItems.length === 0) {
    throw new ManufacturingRequestError(
      `Recipe "${resolvedRecipe.name}" has no RecipeBOM ingredients configured.`,
      'EMPTY_RECIPE_BOM',
      422
    );
  }

  const standardYield = resolvedRecipe.batchYieldQty > 0 ? resolvedRecipe.batchYieldQty : batchOutput;
  const batchScaleRatio = batchOutput / standardYield;

  const overrideMap = new Map<string, number>();
  if (Array.isArray(payload.ingredient_overrides)) {
    for (const ov of payload.ingredient_overrides) {
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
    const scaledStandardQty = Number((bomItem.requiredQty * batchScaleRatio).toFixed(4));
    const hasOverride = overrideMap.has(bomItem.ingredientProductId);
    if (hasOverride && !bomItem.allowVariance) {
      throw new ManufacturingRequestError(
        `Ingredient "${bomItem.ingredientName}" does not allow BOM quantity variance.`,
        'VARIANCE_NOT_ALLOWED',
        422
      );
    }

    const actualQtyToDeduct = hasOverride
      ? Number(overrideMap.get(bomItem.ingredientProductId)!.toFixed(4))
      : scaledStandardQty;

    let unitMovingAvgCost = bomItem.defaultMacCost;
    try {
      const dbMac = await getMovingAverageCost(bomItem.ingredientProductId);
      if (dbMac > 0) unitMovingAvgCost = dbMac;
    } catch {
      // Keep seeded default MAC cost
    }

    const lineCost = Number((actualQtyToDeduct * unitMovingAvgCost).toFixed(4));
    const varianceQty = Number((actualQtyToDeduct - scaledStandardQty).toFixed(4));

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

  const ingredientQty = consumptionPlan.reduce((sum, item) => sum + item.actualQtyToDeduct, 0);
  if (!(ingredientQty > 0)) {
    throw new ManufacturingRequestError(
      'A batch must consume at least one ingredient. Zero-use overrides are not posted.',
      'ZERO_INGREDIENT_USE',
      422
    );
  }

  const ingredientBatchCost = Number(
    consumptionPlan.reduce((sum, item) => sum + item.lineCost, 0).toFixed(4)
  );
  const laborFromFallback = resolvedRecipe.laborHours ?? recipeLaborHours;
  const executionLaborRate = await resolveExecutionLaborRate(
    input.staffId,
    resolvedRecipe.laborRatePerHour ?? recipeLaborRateFromDb
  );
  const packagingFromFallback = resolvedRecipe.packagingCostPerUnit ?? recipePackagingPerUnit;
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
  const batchReferenceId = manufacturingBatchReferenceId(operationId);
  const expirationDate = new Date(
    Date.now() + (resolvedRecipe.outputShelfLifeDays || 3) * 24 * 60 * 60 * 1000
  );
  const recipeForBatch = resolvedRecipe;
  const staffId = input.staffId;

  // Replay is reached only after the recipe and BOM checks above succeed, and only
  // for the staff id stored on the original batch. A later recipe edit that fails
  // those checks does not return the stored result. Override order is part of the
  // payload hash, so a reordered override list is a different payload.
  try {
    const stored = await prisma.$transaction(async (tx) => {
      await tx.manufacturingOperation.create({
        data: {
          id: operationId,
          payloadHash,
          batchReferenceId,
          response: { pending: true },
        },
      });

      const ingredientRows: InventoryTransaction[] = [];
      const orderedPlan = [...consumptionPlan].sort((a, b) =>
        a.ingredientProductId.localeCompare(b.ingredientProductId)
      );
      for (const item of orderedPlan) {
        const qty = Number(Math.abs(item.actualQtyToDeduct).toFixed(4));
        if (qty > 0) {
          await consumeLotsFifo(tx, {
            productId: item.ingredientProductId,
            location: LOC_KITCHEN_PREP,
            qty,
            allowShort: false,
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
      const rowByProduct = new Map(ingredientRows.map((row) => [row.productId, row]));
      const orderedRows = consumptionPlan.map((item) => {
        const row = rowByProduct.get(item.ingredientProductId);
        if (!row) {
          throw new LotAllocationError(`Missing ledger row for ${item.ingredientName}.`);
        }
        return row;
      });

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
            input.notes ||
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

      const projectedGrossMarginPct =
        recipeForBatch.targetRetailPrice > 0
          ? Number(
              (
                ((recipeForBatch.targetRetailPrice - unitOutputCost) /
                  recipeForBatch.targetRetailPrice) *
                100
              ).toFixed(2)
            )
          : 0;

      const result: ManufacturingExecutionResult = {
        success: true,
        batch_reference_id: batchReferenceId,
        recipe_id: recipeForBatch.id,
        recipe_name: recipeForBatch.name,
        output_product_id: recipeForBatch.outputProductId,
        output_product_name: recipeForBatch.outputProductName,
        location: LOC_DELI,
        standard_batch_yield: recipeForBatch.batchYieldQty,
        actual_batch_output: batchOutput,
        total_batch_cost: Number(totalBatchCost.toFixed(2)),
        unit_output_cost: Number(unitOutputCost.toFixed(2)),
        target_retail_price: recipeForBatch.targetRetailPrice,
        projected_gross_margin_pct: projectedGrossMarginPct,
        ingredients_consumed: consumptionPlan.map((item, idx) => ({
          ingredient_product_id: item.ingredientProductId,
          ingredient_name: item.ingredientName,
          unit: item.unit,
          bom_standard_qty: item.bomStandardQty,
          actual_qty_deducted: item.actualQtyToDeduct,
          variance_qty: item.varianceQty,
          moving_average_unit_cost: item.unitMovingAvgCost,
          ingredient_line_cost: Number(item.lineCost.toFixed(2)),
          ledger_transaction_id: orderedRows[idx]!.id,
        })),
        output_transaction: outputRow,
        executed_by_staff_id: staffId,
        executed_by_role: input.staffRole,
        timestamp: new Date().toISOString(),
      };
      const plain = JSON.parse(JSON.stringify(result)) as ManufacturingExecutionResult;
      await tx.manufacturingOperation.update({
        where: { id: operationId },
        data: { response: plain as unknown as Prisma.InputJsonValue },
      });
      return plain;
    });

    invalidateInventoryCaches();
    return { idempotent: false, result: stored };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return replayCompletedOperation(operationId, payloadHash, staffId);
    }
    if (error instanceof LotAllocationError || error instanceof InventoryLedgerError) {
      throw new InventoryLedgerError(error.message, 'INSUFFICIENT_KITCHEN_PREP_STOCK', 409);
    }
    throw new InventoryLedgerError(
      error instanceof Error
        ? error.message
        : 'Manufacturing batch could not be written to the ledger.',
      'MFG_LEDGER_FAILED',
      500
    );
  }
}
