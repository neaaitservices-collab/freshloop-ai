import { NextRequest, NextResponse } from 'next/server';
import { handleApiRouteError } from '@/lib/domains/ai/apiError';
import {
  transcribeWithWhisper,
  WhisperNotConfiguredError,
  WhisperTranscriptionError,
} from '@/lib/domains/ai/whisper';
import { authErrorResponse } from '@/lib/auth/http';
import { requireSessionUser } from '@/lib/auth/session';

/**
 * POST /api/voice
 * multipart/form-data: `audio` file → OpenAI Whisper batch transcription.
 */
export async function POST(req: NextRequest) {
  try {
    await requireSessionUser();

    const form = await req.formData();
    const audio = form.get('audio');
    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json(
        { success: false, error: 'Multipart field "audio" is required.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await audio.arrayBuffer());
    const { transcript } = await transcribeWithWhisper(
      buffer,
      audio.name || 'voice-note.webm',
      audio.type || 'audio/webm'
    );

    return NextResponse.json({
      success: true,
      transcript,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;

    if (error instanceof WhisperNotConfiguredError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 503 }
      );
    }
    if (error instanceof WhisperTranscriptionError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 422 }
      );
    }

    return handleApiRouteError(
      'POST /api/voice',
      error,
      'Failed to transcribe audio. Please try again.'
    );
  }
}
