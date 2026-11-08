'use client';

import React, { useCallback, useState } from 'react';
import { Navigation } from '@/components/layout/Navigation';
import { useAppVoiceOverride } from '@/components/layout/AppVoiceOverrideContext';
import { VoiceLoggerModal } from '@/components/features/voice/VoiceLoggerModal';
import { VOICE_UI_ENABLED } from '@/lib/features/voiceUiEnabled';

export function AppShell({ children }: { children: React.ReactNode }) {
  const voiceOverride = useAppVoiceOverride();
  const [voiceLoggerOpen, setVoiceLoggerOpen] = useState(false);

  const handleVoiceNav = useCallback(() => {
    if (voiceOverride) {
      voiceOverride();
      return;
    }
    setVoiceLoggerOpen(true);
  }, [voiceOverride]);

  const showShellVoiceLogger = VOICE_UI_ENABLED && !voiceOverride;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 md:flex-row">
      <Navigation onVoice={VOICE_UI_ENABLED ? handleVoiceNav : undefined} />
      <div className="flex min-w-0 flex-1 flex-col pb-[var(--freshloop-mobile-nav-h)] md:pb-0">
        {children}
      </div>
      {showShellVoiceLogger ? (
        <VoiceLoggerModal
          isOpen={voiceLoggerOpen}
          onClose={() => setVoiceLoggerOpen(false)}
          onVoiceConfirmed={() => setVoiceLoggerOpen(false)}
        />
      ) : null}
    </div>
  );
}
