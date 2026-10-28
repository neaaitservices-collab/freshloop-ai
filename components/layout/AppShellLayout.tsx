'use client';

import { AppShell } from '@/components/layout/AppShell';
import { AppVoiceOverrideProvider } from '@/components/layout/AppVoiceOverrideContext';

/** Persistent shell for a route segment (use in segment layout.tsx, not in loading.tsx). */
export function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppVoiceOverrideProvider>
      <AppShell>{children}</AppShell>
    </AppVoiceOverrideProvider>
  );
}
