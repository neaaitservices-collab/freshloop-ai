'use client';

import type { ReactNode } from 'react';
import { CloudOff, CloudUpload, Loader2, Wifi } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { cn } from '@/lib/utils/cn';

function badgeCopy(state: ReturnType<typeof useOfflineSync>): {
  label: string;
  variant: BadgeVariant;
  icon: ReactNode;
} {
  if (!state.online) {
    return {
      label:
        state.pendingCount > 0
          ? `Offline · ${state.pendingCount} saved locally`
          : 'Offline mode',
      variant: 'warning',
      icon: <CloudOff className="h-3 w-3" aria-hidden />,
    };
  }
  if (state.phase === 'syncing') {
    return {
      label: state.pendingCount > 0 ? 'Syncing queued changes…' : 'Syncing…',
      variant: 'ocean',
      icon: <Loader2 className="h-3 w-3 animate-spin" aria-hidden />,
    };
  }
  if (state.pendingCount > 0) {
    return {
      label: `Saved offline — syncing (${state.pendingCount})`,
      variant: 'warning',
      icon: <CloudUpload className="h-3 w-3" aria-hidden />,
    };
  }
  return {
    label: 'Connected',
    variant: 'success',
    icon: <Wifi className="h-3 w-3" aria-hidden />,
  };
}

export function OfflineSyncBadge({ className }: { className?: string }) {
  const state = useOfflineSync();
  const { label, variant, icon } = badgeCopy(state);
  if (state.online && state.phase === 'idle' && state.pendingCount === 0) {
    return null;
  }

  return (
    <Badge
      variant={variant}
      className={cn(
        'inline-flex min-h-[28px] items-center gap-1.5 !normal-case !tracking-normal text-[11px]',
        className
      )}
    >
      {icon}
      {label}
    </Badge>
  );
}
