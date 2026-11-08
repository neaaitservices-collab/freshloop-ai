import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/domains/inventory/ledger';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import { requireKitchenStaff } from '@/lib/auth/guardRoute';
import { authErrorResponse } from '@/lib/auth/http';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { recipeIdParamSchema, recipeUpdateBodySchema } from '@/lib/security/schemas/recipes';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';
import { UnitType } from '@prisma/client';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const actor = await requireKitchenStaff();
    const limited = assertMutationRateLimit(actor.id, 'recipe-update', 40);
    if (limited) return limited;

    const { id: rawId } = await context.params;
    const id = recipeIdParamSchema.parse(rawId);
    const body = await parseJsonBody(req, recipeUpdateBodySchema);

    const existing = await prisma.recipe.findUnique({
      where: { id },
      include: { outputProduct: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Recipe not found.' }, { status: 404 });
    }

    const {
      name: trimmedName,
      category,
      yieldPortions,
      targetRetailPrice,
      instructions,
      laborHours,
      laborRate,
      packagingCostPerUnit,
      ingredients: validIngredients,
    } = body;

    const yieldQty = yieldPortions;

    const ingredientProducts = await prisma.product.findMany({
      where: { id: { in: validIngredients.map((i) => i.productId) } },
      select: { id: true, unitType: true },
    });
    const unitByProductId = new Map(
      ingredientProducts.map((p) => [p.id, p.unitType] as const)
    );

    const retailPriceNum =
      Number.isFinite(Number(targetRetailPrice)) && Number(targetRetailPrice) > 0
        ? Number(Number(targetRetailPrice).toFixed(2))
        : existing.targetRetailPrice;

    const laborHoursNum =
      Number.isFinite(Number(laborHours)) && Number(laborHours) >= 0
        ? Number(Number(laborHours).toFixed(2))
        : existing.laborHours;
    const laborRateNum =
      Number.isFinite(Number(laborRate)) && Number(laborRate) > 0
        ? Number(Number(laborRate).toFixed(2))
        : existing.laborRate;
    const packagingNum =
      Number.isFinite(Number(packagingCostPerUnit)) && Number(packagingCostPerUnit) >= 0
        ? Number(Number(packagingCostPerUnit).toFixed(4))
        : existing.packagingCostPerUnit;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: existing.outputProductId },
        data: {
          name: trimmedName,
          retailPrice: retailPriceNum,
          regularRetailPrice: retailPriceNum,
        },
      });

      await tx.recipeBOM.deleteMany({ where: { recipeId: id } });

      return tx.recipe.update({
        where: { id },
        data: {
          name: trimmedName,
          category: category ? String(category).trim() : existing.category,
          yieldPortions: yieldQty,
          instructions: instructions != null ? String(instructions).trim() : existing.instructions,
          targetRetailPrice: retailPriceNum,
          laborHours: laborHoursNum,
          laborRate: laborRateNum,
          packagingCostPerUnit: packagingNum,
          bomLines: {
            create: validIngredients.map((item) => {
              const parsedUnit =
                item.unit && Object.values(UnitType).includes(item.unit as UnitType)
                  ? (item.unit as UnitType)
                  : unitByProductId.get(item.productId) ?? UnitType.UNIT;
              return {
                ingredientProductId: item.productId,
                quantityRequired: item.quantity,
                unit: parsedUnit,
              };
            }),
          },
        },
        include: {
          outputProduct: true,
          bomLines: { include: { ingredientProduct: true } },
        },
      });
    });

    invalidateInventoryCaches();

    return NextResponse.json({ success: true, recipe: updated });
  } catch (error: unknown) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    console.error('Failed to update recipe:', error);
    return apiErrorFromUnknown(error, 'Could not update recipe.');
  }
}
