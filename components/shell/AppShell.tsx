'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { useRole } from '@/components/auth/RoleProvider';
import { VoiceLoggerModal } from '@/components/VoiceLoggerModal';
import { canVisit, homeForRole } from '@/lib/roles';

export function AppShell({
  children,
  onVoice,
}: {
  children: React.ReactNode;
  onVoice?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeUser, loading } = useRole();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const openVoice = onVoice ?? (() => setVoiceOpen(true));

  useEffect(() => {
    if (loading || !activeUser) return;
    if (!canVisit(activeUser.role, pathname)) {
      router.replace(homeForRole(activeUser.role));
    }
  }, [activeUser, loading, pathname, router]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100 md:flex-row">
      <Navigation onVoice={openVoice} />
      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">{children}</div>
      {!onVoice ? (
        <VoiceLoggerModal isOpen={voiceOpen} onClose={() => setVoiceOpen(false)} />
      ) : null}
    </div>
  );
}
