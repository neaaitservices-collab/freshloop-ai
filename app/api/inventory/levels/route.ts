import { NextRequest, NextResponse } from 'next/server';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
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
  try {
    const actor = await requireOperationalStaff();
    const body = await parseJsonBody(req, inventoryLevelsPatchSchema);
    const productId = body.productId;

    const limited = assertMutationRateLimit(
      actor.id,
      body.casesOnHand !== undefined ? 'inventory-stock-override' : 'inventory-levels-patch',
      body.casesOnHand !== undefined ? 20 : 90
    );
    if (limited) return limited;

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
    if (body.department !== undefined || body.origin !== undefined) {
      const level = await updateProductCatalogMeta({
        productId,
        department: body.department,
        supplier: typeof body.supplier === 'string' ? body.supplier : undefined,
        origin: body.origin,
      });
      return NextResponse.json({ success: true, level });
    }
    if (typeof body.supplier === 'string') {
      const level = await setSupplier(productId, body.supplier);
      return NextResponse.json({ success: true, level });
    }
    if (body.packSize !== undefined) {
      const packSize = Number(body.packSize);
      const yieldDivisor = Number(body.yieldDivisor);
      const retailPrice = Number(body.retailPrice);
      if (![packSize, yieldDivisor, retailPrice].every(Number.isFinite)) {
        return NextResponse.json({ success: false, error: 'Case numbers must be finite.' }, { status: 400 });
      }
      const level = await updateCase({
        productId,
        packSize,
        yieldDivisor,
        retailUnit: body.retailUnit ?? 'units',
        retailPrice,
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
    return apiErrorFromUnknown(error, 'The alert level could not be saved.');
  }
}
