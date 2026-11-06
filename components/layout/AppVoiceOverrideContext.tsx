'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { VOICE_UI_ENABLED } from '@/lib/features/voiceUiEnabled';

type VoiceHandler = (() => void) | null;

const AppVoiceOverrideContext = createContext<{
  handler: VoiceHandler;
  setHandler: (fn: VoiceHandler) => void;
} | null>(null);

export function AppVoiceOverrideProvider({ children }: { children: React.ReactNode }) {
  const [handler, setHandlerState] = useState<VoiceHandler>(null);
  const setHandler = useCallback((fn: VoiceHandler) => {
    setHandlerState(() => fn);
  }, []);

  const value = useMemo(() => ({ handler, setHandler }), [handler, setHandler]);

  return (
    <AppVoiceOverrideContext.Provider value={value}>{children}</AppVoiceOverrideContext.Provider>
  );
}

export function useAppVoiceOverride(): VoiceHandler {
  const ctx = useContext(AppVoiceOverrideContext);
  return ctx?.handler ?? null;
}

/** Pages with a custom voice modal (e.g. kitchen recorder) register here. */
export function useRegisterAppVoice(handler: (() => void) | null) {
  const ctx = useContext(AppVoiceOverrideContext);
  React.useEffect(() => {
    if (!VOICE_UI_ENABLED || !ctx) return;
    ctx.setHandler(handler);
    return () => {
      ctx.setHandler(null);
    };
  }, [ctx, handler]);
}
