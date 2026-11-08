import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/domains/inventory/ledger';
import { getRecipeListBundle } from '@/lib/domains/manufacturing/recipeListRead';
import { requireKitchenStaff } from '@/lib/auth/guardRoute';
import { authErrorResponse } from '@/lib/auth/http';
import { apiErrorFromUnknown } from '@/lib/domains/ai/apiError';
import { parseJsonBody } from '@/lib/security/parseJsonBody';
import { recipeCreateBodySchema } from '@/lib/security/schemas/recipes';
import { assertMutationRateLimit } from '@/lib/security/rateLimit';
import { invalidateInventoryCaches } from '@/lib/domains/inventory/inventoryCache';
import { Department, UnitType, RecipeStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireKitchenStaff();

    const { recipes, inventoryProducts } = await getRecipeListBundle();

    return NextResponse.json({
      success: true,
      recipes,
      inventoryProducts,
    });
  } catch (error: unknown) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return apiErrorFromUnknown(error, 'Could not fetch recipes.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireKitchenStaff();
    const limited = assertMutationRateLimit(actor.id, 'recipe-create', 30);
    if (limited) return limited;

    const body = await parseJsonBody(req, recipeCreateBodySchema);
    const {
      name: trimmedName,
      category,
      yieldPortions,
      portionSize,
      targetRetailPrice,
      instructions,
      outputUnit,
      laborHours,
      laborRate,
      packagingCostPerUnit,
      ingredients,
    } = body;

    const yieldQty = yieldPortions;
    const validIngredients = ingredients;

    const ingredientProducts = await prisma.product.findMany({
      where: { id: { in: validIngredients.map((i) => i.productId) } },
      select: { id: true, unitType: true },
    });
    const unitByProductId = new Map(
      ingredientProducts.map((p) => [p.id, p.unitType] as const)
    );

    // Create or find manufactured output Product
    const retailPriceNum =
      Number.isFinite(Number(targetRetailPrice)) && Number(targetRetailPrice) > 0
        ? Number(Number(targetRetailPrice).toFixed(2))
        : 6.99;

    const unitTypeEnum = (
      outputUnit && Object.values(UnitType).includes(outputUnit as UnitType)
        ? outputUnit
        : UnitType.TUB
    ) as UnitType;

    const outputProduct = await prisma.product.create({
      data: {
        name: trimmedName,
        department: Department.DELI_KITCHEN,
        unitType: unitTypeEnum,
        targetMargin: 0.45,
        shelfLifeDays: 3,
        isManufactured: true,
        retailPrice: retailPriceNum,
        regularRetailPrice: retailPriceNum,
      },
    });

    // Create Recipe and BOM lines in transaction
    const laborHoursNum =
      Number.isFinite(Number(laborHours)) && Number(laborHours) >= 0
        ? Number(Number(laborHours).toFixed(2))
        : 0;
    const laborRateNum =
      Number.isFinite(Number(laborRate)) && Number(laborRate) > 0
        ? Number(Number(laborRate).toFixed(2))
        : null;
    const packagingNum =
      Number.isFinite(Number(packagingCostPerUnit)) && Number(packagingCostPerUnit) >= 0
        ? Number(Number(packagingCostPerUnit).toFixed(4))
        : 0;

    const createdRecipe = await prisma.recipe.create({
      data: {
        name: trimmedName,
        category: category ? String(category).trim() : 'Prepared Foods',
        outputProductId: outputProduct.id,
        yieldPortions: yieldQty,
        portionSize: portionSize ? String(portionSize).trim() : undefined,
        instructions: instructions ? String(instructions).trim() : '',
        targetRetailPrice: retailPriceNum,
        laborHours: laborHoursNum,
        laborRate: laborRateNum,
        packagingCostPerUnit: packagingNum,
        status: RecipeStatus.IN_KITCHEN,
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
        bomLines: {
          include: {
            ingredientProduct: true,
          },
        },
      },
    });

    invalidateInventoryCaches();

    return NextResponse.json({
      success: true,
      recipe: createdRecipe,
    });
  } catch (error: unknown) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    console.error('Failed to create custom recipe:', error);
    return apiErrorFromUnknown(error, 'Could not save recipe.');
  }
}
