export const VOICE_MAX_RECORDING_SECONDS = 60;

export type VoicePipelinePhase =
  | 'idle'
  | 'recording'
  | 'uploading'
  | 'transcribing'
  | 'parsing';

export function formatVoiceClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function voicePipelineStatusLabel(phase: VoicePipelinePhase): string {
  switch (phase) {
    case 'recording':
      return 'Recording';
    case 'uploading':
      return 'Uploading audio…';
    case 'transcribing':
      return 'Transcribing (Whisper)…';
    case 'parsing':
      return 'Parsing command…';
    default:
      return '';
  }
}
