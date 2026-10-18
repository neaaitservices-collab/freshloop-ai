import { NextRequest, NextResponse } from 'next/server';
import { processInvoiceOcr } from '@/lib/gemini';
import { addInvoiceItemsToInventory } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64, mimeType, autoImport } = body;

    if (!imageBase64 && !body.demo) {
      return NextResponse.json(
        { error: 'Missing imageBase64 in request body' },
        { status: 400 }
      );
    }

    const ocrResult = await processInvoiceOcr(
      imageBase64 || '',
      mimeType || 'image/jpeg'
    );

    let importedItems = [];
    if (autoImport) {
      importedItems = await addInvoiceItemsToInventory(ocrResult);
    }

    return NextResponse.json({
      success: true,
      data: ocrResult,
      importedCount: importedItems.length,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('API Error in /api/invoice-ocr:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process vendor invoice OCR' },
      { status: 500 }
    );
  }
}
