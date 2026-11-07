/**
 * Batch transcription via OpenAI Whisper (whisper-1).
 * Used for short push-to-talk blobs — no streaming WebSockets.
 */

const WHISPER_MODEL = 'whisper-1';
const MAX_AUDIO_BYTES = 24 * 1024 * 1024; // OpenAI limit is 25MB

export class WhisperNotConfiguredError extends Error {
  constructor() {
    super('OPENAI_API_KEY is not configured.');
    this.name = 'WhisperNotConfiguredError';
  }
}

export class WhisperTranscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WhisperTranscriptionError';
  }
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
}

export async function transcribeWithWhisper(
  audio: Buffer,
  filename: string,
  mimeType: string = 'audio/webm'
): Promise<{ transcript: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new WhisperNotConfiguredError();
  }
  if (audio.byteLength === 0) {
    throw new WhisperTranscriptionError('Audio file is empty.');
  }
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    throw new WhisperTranscriptionError('Audio file exceeds the 24MB upload limit.');
  }

  const safeName =
    filename && filename.includes('.')
      ? filename
      : `voice-note.${extensionForMime(mimeType)}`;

  const body = new FormData();
  body.append('file', new Blob([new Uint8Array(audio)], { type: mimeType || 'audio/webm' }), safeName);
  body.append('model', WHISPER_MODEL);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });

  const payload = (await res.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };

  if (!res.ok) {
    const detail = payload.error?.message || res.statusText || 'Whisper request failed';
    throw new WhisperTranscriptionError(detail);
  }

  const transcript = typeof payload.text === 'string' ? payload.text.trim() : '';
  if (!transcript) {
    throw new WhisperTranscriptionError('Whisper returned an empty transcript.');
  }

  return { transcript };
}
