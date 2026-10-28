import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/domains/inventory/ledger';
import { requireSessionUser } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/http';
import { Department, UnitType, RecipeStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireSessionUser();

    const [recipes, inventoryProducts] = await Promise.all([
      prisma.recipe.findMany({
        include: {
          outputProduct: true,
          bomLines: {
            include: {
              ingredientProduct: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.findMany({
        where: { isManufactured: false },
        select: {
          id: true,
          name: true,
          department: true,
          unitType: true,
          standardCost: true,
          retailPrice: true,
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return NextResponse.json({
      success: true,
      recipes,
      inventoryProducts,
    });
  } catch (error: unknown) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Could not fetch recipes.',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSessionUser();
    const body = await req.json();

    const {
      name,
      category,
      yieldPortions,
      portionSize,
      targetRetailPrice,
      instructions,
      outputUnit,
      laborHours,
      laborRate,
      packagingCostPerUnit,
      ingredients, // Array of { productId: string, quantity: number, unit?: string }
    } = body;

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) {
      return NextResponse.json(
        { success: false, error: 'Recipe name is required.' },
        { status: 400 }
      );
    }

    const yieldQty = Number(yieldPortions);
    if (!Number.isFinite(yieldQty) || yieldQty <= 0) {
      return NextResponse.json(
        { success: false, error: 'Standard yield portions must be greater than 0.' },
        { status: 400 }
      );
    }

    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one ingredient from inventory is required.' },
        { status: 400 }
      );
    }

    // Validate that each ingredient exists
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

    return NextResponse.json({
      success: true,
      recipe: createdRecipe,
    });
  } catch (error: unknown) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    console.error('Failed to create custom recipe:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Could not save recipe.',
      },
      { status: 500 }
    );
  }
}
