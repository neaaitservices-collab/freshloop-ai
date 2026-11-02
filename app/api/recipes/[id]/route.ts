import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/domains/inventory/ledger';
import { requireSessionUser } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/http';
import { UnitType } from '@prisma/client';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    await requireSessionUser();
    const { id } = await context.params;
    const body = await req.json();

    const existing = await prisma.recipe.findUnique({
      where: { id },
      include: { outputProduct: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Recipe not found.' }, { status: 404 });
    }

    const {
      name,
      category,
      yieldPortions,
      targetRetailPrice,
      instructions,
      laborHours,
      laborRate,
      packagingCostPerUnit,
      ingredients,
    } = body;

    const trimmedName = typeof name === 'string' ? name.trim() : existing.name;
    if (!trimmedName) {
      return NextResponse.json(
        { success: false, error: 'Recipe name is required.' },
        { status: 400 }
      );
    }

    const yieldQty = Number(yieldPortions ?? existing.yieldPortions);
    if (!Number.isFinite(yieldQty) || yieldQty <= 0) {
      return NextResponse.json(
        { success: false, error: 'Standard yield portions must be greater than 0.' },
        { status: 400 }
      );
    }

    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one ingredient is required.' },
        { status: 400 }
      );
    }

    const validIngredients: { productId: string; quantity: number; unit?: string }[] = [];
    for (const ing of ingredients) {
      const pid = String(ing.productId ?? '').trim();
      const qty = Number(ing.quantity);
      if (!pid || !Number.isFinite(qty) || qty <= 0) continue;
      validIngredients.push({
        productId: pid,
        quantity: qty,
        unit: ing.unit ? String(ing.unit).trim() : undefined,
      });
    }

    if (validIngredients.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Please enter valid ingredient quantities.' },
        { status: 400 }
      );
    }

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

    return NextResponse.json({ success: true, recipe: updated });
  } catch (error: unknown) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    console.error('Failed to update recipe:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Could not update recipe.',
      },
      { status: 500 }
    );
  }
}
