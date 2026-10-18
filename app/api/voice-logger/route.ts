import { NextRequest, NextResponse } from 'next/server';
import { processVoiceFloorLog } from '@/lib/gemini';
import { addVoiceLogItemToInventory } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { audioBase64, mimeType, spokenText, autoSave } = body;

    const voiceResult = await processVoiceFloorLog(
      audioBase64,
      mimeType || 'audio/webm',
      spokenText
    );

    let savedItems = [];
    if (autoSave) {
      savedItems = await addVoiceLogItemToInventory(voiceResult);
    }

    return NextResponse.json({
      success: true,
      data: voiceResult,
      savedCount: savedItems.length,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('API Error in /api/voice-logger:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process voice floor log' },
      { status: 500 }
    );
  }
}
