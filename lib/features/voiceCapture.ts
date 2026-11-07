/**
 * Push-to-talk MediaRecorder helper — records compressed Opus/WebM only while active.
 */

import { formatVoiceClock, VOICE_MAX_RECORDING_SECONDS } from '@/lib/features/voicePipelineUi';

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
] as const;

/** ~32 kbps voice note — browsers may ignore; Opus in WebM still compresses well. */
const VOICE_BITRATE = 32_000;

export { VOICE_MAX_RECORDING_SECONDS };

export type VoiceRecorderCallbacks = {
  onDurationTick?: (elapsedSeconds: number, maxSeconds: number) => void;
  /** Fires after auto-stop when max duration is reached. */
  onMaxDurationReached?: (blob: Blob | null) => void;
};

export function pickVoiceRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  for (const mime of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return 'audio/webm';
}

export class PushToTalkRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private mimeType = 'audio/webm';
  private maxDurationMs = VOICE_MAX_RECORDING_SECONDS * 1000;
  private startedAt = 0;
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: VoiceRecorderCallbacks = {};
  private maxDurationStopInFlight = false;

  get active(): boolean {
    return this.recorder?.state === 'recording';
  }

  setCallbacks(callbacks: VoiceRecorderCallbacks): void {
    this.callbacks = callbacks;
  }

  setMaxDurationMs(ms: number): void {
    this.maxDurationMs = Math.max(5_000, Math.min(ms, 120_000));
  }

  async start(): Promise<void> {
    if (this.active) return;

    this.mimeType = pickVoiceRecorderMimeType();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const options: MediaRecorderOptions = { mimeType: this.mimeType, audioBitsPerSecond: VOICE_BITRATE };
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(this.stream, options);
    } catch {
      recorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });
    }

    this.chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };

    this.recorder = recorder;
    recorder.start();
    this.startedAt = Date.now();
    this.maxDurationStopInFlight = false;
    const maxSeconds = Math.ceil(this.maxDurationMs / 1000);
    this.callbacks.onDurationTick?.(0, maxSeconds);
    this.durationTimer = setInterval(() => {
      const elapsedMs = Date.now() - this.startedAt;
      const elapsedSeconds = Math.floor(elapsedMs / 1000);
      this.callbacks.onDurationTick?.(elapsedSeconds, maxSeconds);
      if (!this.maxDurationStopInFlight && elapsedMs >= this.maxDurationMs) {
        this.maxDurationStopInFlight = true;
        void this.stop().then((blob) => {
          this.callbacks.onMaxDurationReached?.(blob);
        });
      }
    }, 200);
  }

  async stop(): Promise<Blob | null> {
    this.clearDurationTimer();
    const recorder = this.recorder;
    if (!recorder || recorder.state === 'inactive') {
      this.releaseStream();
      return null;
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const parts = this.chunks;
        this.chunks = [];
        if (parts.length === 0) {
          resolve(null);
          return;
        }
        resolve(new Blob(parts, { type: this.mimeType }));
      };
      recorder.stop();
    });

    this.recorder = null;
    this.releaseStream();
    return blob;
  }

  cancel(): void {
    this.clearDurationTimer();
    try {
      if (this.recorder && this.recorder.state !== 'inactive') {
        this.recorder.stop();
      }
    } catch {
      // ignore
    }
    this.recorder = null;
    this.chunks = [];
    this.releaseStream();
  }

  private clearDurationTimer(): void {
    if (this.durationTimer) clearInterval(this.durationTimer);
    this.durationTimer = null;
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

export function voiceBlobFilename(blob: Blob): string {
  const type = blob.type || 'audio/webm';
  if (type.includes('mp4') || type.includes('m4a')) return 'voice-note.m4a';
  return 'voice-note.webm';
}

export const formatRecordingClock = formatVoiceClock;
