/**
 * Frontend voice UI (nav, mic buttons, modals). Backend `/api/voice-logger` stays enabled.
 * Shell: `components/layout/AppShell.tsx` + `Navigation` voice item.
 * Production → `VoiceRecorderModal`; Operations → `VoiceLoggerModal` via `useRegisterAppVoice`.
 */
export const VOICE_UI_ENABLED = true;
