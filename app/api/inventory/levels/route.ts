import { NextRequest, NextResponse } from 'next/server';
import { apiErrorFromUnknown, handleApiRouteError } from '@/lib/domains/ai/apiError';
import { authErrorResponse } from '@/lib/auth/http';
import { requireOperationalStaff } from '@/lib/auth/guardRoute';
import { requireSessionUser } from '@/lib/auth/session';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { inventoryLevelsPatchSchema } from '@/lib/security/schemas/inventory';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';
import { productIdSchema } from '@/lib/security/schemas/common';
import { isManager } from '@/lib/utils/roles';
import { parsePosSalesDaysParam } from '@/lib/domains/inventory/posSalesUnits';
import { filterLevelsWithAnyStock } from '@/lib/domains/inventory/subInventoryView';
import {
  applyRetailMarkdown,
  getStockLevel,
  getStockLevels,
  getStockLevelsWithPosSales,
  moveRetailStock,
  PAR_CASES,
  setParCases,
  setStockCases,
  setSupplier,
  updateCase,
  updateProductCatalogMeta,
  getLastStockOverrideAudit,
  removeProductFromCatalog,
} from '@/lib/domains/inventory/stock';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireOperationalStaff();
    const auditProductId = req.nextUrl.searchParams.get('auditProductId')?.trim();
    if (auditProductId) {
      const audit = await getLastStockOverrideAudit(auditProductId);
      return NextResponse.json({ success: true, audit });
    }
    const singleProductId = req.nextUrl.searchParams.get('productId')?.trim();
    if (singleProductId) {
      const level = await getStockLevel(singleProductId);
      return NextResponse.json({ success: true, level });
    }
    const inStockOnly = req.nextUrl.searchParams.get('inStockOnly') === '1';
    const includePosSales = req.nextUrl.searchParams.get('includePosSales') === '1';
    const salesDays = parsePosSalesDaysParam(req.nextUrl.searchParams.get('salesDays'));
    let levels = includePosSales
      ? await getStockLevelsWithPosSales(salesDays)
      : await getStockLevels();
    if (inStockOnly) {
      levels = filterLevelsWithAnyStock(levels);
    }
    const low = levels.filter((row) => row.low);
    return NextResponse.json({
      success: true,
      parCases: PAR_CASES,
      count: levels.length,
      lowCount: low.length,
      orderCost: Number(low.reduce((sum, row) => sum + row.orderCost, 0).toFixed(2)),
      levels,
    });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Stock levels could not be read.');
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const actor = await requireSessionUser();
    if (actor.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Only an admin can remove items from the catalog.' },
        { status: 403 }
      );
    }
    const productIdRaw = req.nextUrl.searchParams.get('productId')?.trim() ?? '';
    const productId = productIdSchema.parse(productIdRaw);
    await removeProductFromCatalog(productId);
    return NextResponse.json({ success: true, productId });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'The item could not be removed from the catalog.');
  }
}

export async function PATCH(req: NextRequest) {
  let actorId: string | undefined;
  let productId: string | undefined;
  try {
    const actor = await requireOperationalStaff();
    actorId = actor.id;
    const body = await parseJsonBody(req, inventoryLevelsPatchSchema);
    productId = body.productId;

    const limited = assertMutationRateLimit(
      actor.id,
      body.casesOnHand !== undefined ? 'inventory-stock-override' : 'inventory-levels-patch',
      body.casesOnHand !== undefined ? 20 : 90
    );
    if (limited) return limited;

    const isPricingOrCatalogPatch =
      body.packSize !== undefined ||
      body.parCases !== undefined ||
      body.department !== undefined ||
      body.origin !== undefined ||
      body.pullSensitivityDays !== undefined ||
      typeof body.supplier === 'string';

    if (isPricingOrCatalogPatch && !isManager(actor.role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Only a store manager or admin can change catalog pricing and metadata.',
        },
        { status: 403 }
      );
    }

    if (body.action === 'markdown') {
      const discountPct =
        typeof body.discountPct === 'number' && Number.isFinite(body.discountPct)
          ? body.discountPct
          : 30;
      const marked = await applyRetailMarkdown(productId, actor.id, discountPct);
      return NextResponse.json({ success: true, action: 'markdown', level: marked.level });
    }
    if (body.action === 'rescue' || body.action === 'waste') {
      const moved = await moveRetailStock(
        productId,
        body.action,
        actor.id,
        body.quantity
      );
      return NextResponse.json({
        success: true,
        action: body.action,
        level: moved.level,
        units: moved.units,
        retailFloorQty: moved.level.onHand,
        kitchenPrepQty: moved.level.kitchenPrepQty,
      });
    }

    if (body.casesOnHand !== undefined) {
      if (!isManager(actor.role)) {
        return NextResponse.json(
          { success: false, error: 'Only an admin or store manager can change stock.' },
          { status: 403 }
        );
      }
      const casesOnHand = Number(body.casesOnHand);
      if (!Number.isFinite(casesOnHand) || casesOnHand < 0) {
        return NextResponse.json({ success: false, error: 'Cases must be zero or greater.' }, { status: 400 });
      }
      const level = await setStockCases(productId, casesOnHand, actor.id);
      const audit = await getLastStockOverrideAudit(productId);
      return NextResponse.json({ success: true, level, audit });
    }
    if (
      body.department !== undefined ||
      body.origin !== undefined ||
      body.pullSensitivityDays !== undefined
    ) {
      const level = await updateProductCatalogMeta({
        productId,
        department: body.department,
        supplier: typeof body.supplier === 'string' ? body.supplier : undefined,
        origin: body.origin,
        pullSensitivityDays: body.pullSensitivityDays,
      });
      return NextResponse.json({ success: true, level });
    }
    if (typeof body.supplier === 'string') {
      const level = await setSupplier(productId, body.supplier);
      return NextResponse.json({ success: true, level });
    }
    if (body.packSize !== undefined) {
      const packSize = Number(body.packSize);
      const splitFactor = Number(body.splitFactor);
      if (![packSize, splitFactor].every(Number.isFinite) || packSize <= 0 || splitFactor <= 0) {
        return NextResponse.json({ success: false, error: 'Pack and split must be valid positive numbers.' }, { status: 400 });
      }
      let retailPrice: number | undefined;
      if (body.retailPrice !== undefined) {
        retailPrice = Number(body.retailPrice);
        if (!Number.isFinite(retailPrice)) {
          return NextResponse.json({ success: false, error: 'retailPrice must be a number.' }, { status: 400 });
        }
      }
      let caseRetailPrice: number | null | undefined;
      if (body.caseRetailPrice === null) {
        caseRetailPrice = null;
      } else if (body.caseRetailPrice !== undefined) {
        const parsed = Number(body.caseRetailPrice);
        if (!Number.isFinite(parsed)) {
          return NextResponse.json({ success: false, error: 'caseRetailPrice must be a number or null.' }, { status: 400 });
        }
        caseRetailPrice = parsed > 0 ? parsed : null;
      }
      let caseCost: number | undefined;
      if (body.caseCost !== undefined) {
        caseCost = Number(body.caseCost);
        if (!Number.isFinite(caseCost) || caseCost < 0) {
          return NextResponse.json({ success: false, error: 'caseCost must be zero or greater.' }, { status: 400 });
        }
      }
      const level = await updateCase({
        productId,
        packSize,
        splitFactor,
        retailUnit: body.retailUnit ?? 'units',
        ...(retailPrice !== undefined ? { retailPrice } : {}),
        ...(caseRetailPrice !== undefined ? { caseRetailPrice } : {}),
        ...(caseCost !== undefined ? { caseCost } : {}),
      });
      return NextResponse.json({ success: true, level });
    }
    if (body.parCases !== undefined) {
      const parCases = Number(body.parCases);
      if (!Number.isFinite(parCases)) {
        return NextResponse.json({ success: false, error: 'parCases must be a number.' }, { status: 400 });
      }
      const level = await setParCases(productId, parCases);
      return NextResponse.json({ success: true, level });
    }

    return NextResponse.json(
      { success: false, error: 'Provide parCases, supplier, case fields, casesOnHand, or action (rescue|waste|markdown).' },
      { status: 400 }
    );
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return handleApiRouteError(
      'PATCH /api/inventory/levels',
      error,
      'The alert level could not be saved.',
      {
        path: '/api/inventory/levels',
        actorId,
        productId,
        operation: 'level-patch',
      }
    );
  }
}
