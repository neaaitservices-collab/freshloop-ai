/**
 * Frontend voice UI (nav, mic buttons, modals). Backend `/api/voice-logger` stays enabled.
 *
 * Re-enable phase: set to `true`, then restore shell wiring in `AppShell` (VoiceLoggerModal +
 * `Navigation onVoice`), Operations (`VoiceLoggerModal` button), and Production (`VoiceRecorderModal` button).
 */
export const VOICE_UI_ENABLED = false;
