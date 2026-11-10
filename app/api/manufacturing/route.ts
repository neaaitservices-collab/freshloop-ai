import { NextRequest, NextResponse } from 'next/server';
import { InventoryLedgerError } from '@/lib/domains/inventory/ledger';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireRoles } from '@/lib/auth/session';
import { MANUFACTURING_ROLES } from '@/lib/auth/permissions';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { manufacturingPostBodySchema } from '@/lib/security/schemas/manufacturing';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';
import { buildManufacturingRecipeCatalog } from '@/lib/domains/manufacturing/buildCatalog';
import {
  ManufacturingOperationConflictError,
  ManufacturingRequestError,
  executeManufacturingBatch,
} from '@/lib/domains/manufacturing/executeBatch';

export async function GET() {
  try {
    await requireRoles(MANUFACTURING_ROLES);
    const recipes = await buildManufacturingRecipeCatalog();
    const readOnly = recipes.some((recipe) => recipe.fallback === true || recipe.readOnly === true);
    return NextResponse.json({ success: true, recipes, fallback: readOnly, readOnly });
  } catch (error: unknown) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Could not load recipe catalog.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireRoles(MANUFACTURING_ROLES);
    const limited = assertMutationRateLimit(actor.id, 'manufacturing-batch', 15);
    if (limited) return limited;

    const parsed = await parseJsonBody(req, manufacturingPostBodySchema);
    const outcome = await executeManufacturingBatch({
      operationId: parsed.operation_id,
      staffId: actor.id,
      staffRole: actor.role,
      recipeId: parsed.recipe_id,
      batchOutput: parsed.batch_output,
      ingredientOverrides: parsed.ingredient_overrides,
      enforceStockCheck: parsed.enforce_stock_check,
      notes: parsed.notes,
    });

    return NextResponse.json({ ...outcome.result, idempotent: outcome.idempotent });
  } catch (error: unknown) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    if (error instanceof ManufacturingOperationConflictError) {
      return NextResponse.json(
        { success: false, code: error.code, error: error.message },
        { status: error.statusCode }
      );
    }
    if (error instanceof ManufacturingRequestError || error instanceof InventoryLedgerError) {
      return NextResponse.json(
        { success: false, code: error.code, error: error.message },
        { status: error.statusCode }
      );
    }
    return apiErrorFromUnknown(error, 'Failed to execute production recipe manufacturing batch.');
  }
}
