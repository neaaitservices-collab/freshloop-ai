/**
 * Push-to-talk MediaRecorder helper — records compressed Opus/WebM only while active.
 */

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
] as const;

/** ~32 kbps voice note — browsers may ignore; Opus in WebM still compresses well. */
const VOICE_BITRATE = 32_000;

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

  get active(): boolean {
    return this.recorder?.state === 'recording';
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
  }

  async stop(): Promise<Blob | null> {
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
