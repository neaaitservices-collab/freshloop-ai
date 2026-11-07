/**
 * Client transport for voice parse — multipart audio blob (no base64 JSON bloat).
 */

export async function postVoiceLoggerParse(input: {
  audioBlob?: Blob | null;
  spokenText?: string;
}): Promise<Response> {
  const hasAudio = Boolean(input.audioBlob && input.audioBlob.size > 0);

  if (hasAudio && input.audioBlob) {
    const form = new FormData();
    form.append('audio', input.audioBlob, voiceBlobFilename(input.audioBlob));
    form.append('confirmCommit', 'false');
    if (input.spokenText?.trim()) {
      form.append('spokenText', input.spokenText.trim());
    }
    return fetch('/api/voice-logger', {
      method: 'POST',
      body: form,
    });
  }

  return fetch('/api/voice-logger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      spokenText: input.spokenText?.trim() || '',
      confirmCommit: false,
    }),
  });
}

function voiceBlobFilename(blob: Blob): string {
  const type = blob.type || 'audio/webm';
  if (type.includes('mp4') || type.includes('m4a')) return 'voice-note.m4a';
  return 'voice-note.webm';
}

export async function postVoiceTranscribe(audioBlob: Blob): Promise<Response> {
  const form = new FormData();
  form.append('audio', audioBlob, voiceBlobFilename(audioBlob));
  return fetch('/api/voice', {
    method: 'POST',
    body: form,
  });
}
