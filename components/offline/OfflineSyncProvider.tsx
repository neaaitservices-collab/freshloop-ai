'use client';

import { useEffect } from 'react';
import { startOfflineSyncManager } from '@/lib/offline/syncManager';

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => startOfflineSyncManager(), []);
  return children;
}
