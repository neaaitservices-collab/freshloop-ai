import { NextRequest, NextResponse } from 'next/server';
import { loadReceivingLogs, RECEIVING_SHEET_NAME } from '@/lib/domains/receiving/receivingSheet';
import { postReceipt } from '@/lib/domains/inventory/stock';
import { calculateYieldQuote, resolveTargetMargin, type MarginMode, type RetailUnit, RETAIL_UNITS } from '@/lib/domains/receiving/yieldPricing';

export const dynamic = 'force-dynamic';

interface SavedPack {
  id: string;
  itemName: string;
  casesReceived: number;
  caseCost: number;
  packSize: number;
  yieldDivisor: number;
  retailUnit: RetailUnit;
  targetMargin: number;
  totalRetailUnits: number | null;
  unitCost: number | null;
  targetSrp: number | null;
  currentRetailPrice: number;
  currentMarginPct: number | null;
  savedAt: string;
}

const savedPacks: SavedPack[] = [];

export async function GET() {
  const result = await loadReceivingLogs();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      itemName?: string;
      casesReceived?: number;
      caseCost?: number;
      packSize?: number;
      yieldDivisor?: number;
      retailUnit?: string;
      marginMode?: MarginMode;
      customMarginPercent?: number;
      currentRetailPrice?: number;
    };

    const itemName = body.itemName?.trim() ?? '';
    const casesReceived = Number(body.casesReceived);
    const caseCost = Number(body.caseCost);
    const packSize = Number(body.packSize);
    const yieldDivisor = Number(body.yieldDivisor);
    const currentRetailPrice = Number(body.currentRetailPrice);
    const retailUnit = body.retailUnit as RetailUnit;
    const marginMode: MarginMode =
      body.marginMode === '35' || body.marginMode === '40' || body.marginMode === 'custom'
        ? body.marginMode
        : '40';

    if (!itemName) {
      return NextResponse.json({ success: false, error: 'itemName is required.' }, { status: 400 });
    }
    if (!RETAIL_UNITS.includes(retailUnit)) {
      return NextResponse.json(
        { success: false, error: 'retailUnit must be units, quarts, or lbs.' },
        { status: 400 }
      );
    }
    if (![casesReceived, caseCost, packSize, yieldDivisor, currentRetailPrice].every(Number.isFinite)) {
      return NextResponse.json(
        { success: false, error: 'Receiving and pricing numbers must be finite.' },
        { status: 400 }
      );
    }
    if (packSize <= 0 || yieldDivisor <= 0) {
      return NextResponse.json(
        { success: false, error: 'Pack Size and Yield Divisor must be greater than 0.' },
        { status: 400 }
      );
    }

    const targetMargin = resolveTargetMargin(marginMode, Number(body.customMarginPercent) || 0);
    const quote = calculateYieldQuote({
      caseCost,
      packSize,
      yieldDivisor,
      targetMargin,
      currentRetailPrice,
    });

    const record: SavedPack = {
      id: `pack-${Date.now()}`,
      itemName,
      casesReceived,
      caseCost,
      packSize,
      yieldDivisor,
      retailUnit,
      targetMargin,
      totalRetailUnits: quote.totalRetailUnits,
      unitCost: quote.unitCost,
      targetSrp: quote.targetSrp,
      currentRetailPrice,
      currentMarginPct: quote.currentMarginPct,
      savedAt: new Date().toISOString(),
    };

    savedPacks.unshift(record);
    if (savedPacks.length > 50) savedPacks.pop();

    let stock: Awaited<ReturnType<typeof postReceipt>> = {
      posted: false,
      reason: 'Stock was not updated.',
    };
    try {
      stock = await postReceipt({
        itemName,
        casesReceived,
        caseCost,
        packSize,
        yieldDivisor,
        retailPrice: currentRetailPrice,
        retailUnit,
      });
    } catch (error) {
      stock = {
        posted: false,
        reason: error instanceof Error ? error.message : 'Stock was not updated.',
      };
    }

    return NextResponse.json({
      success: true,
      destination: stock.posted ? 'ledger' : 'session',
      sheetName: RECEIVING_SHEET_NAME,
      record,
      stock,
      savedCount: savedPacks.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save the configured pack.',
      },
      { status: 500 }
    );
  }
}
