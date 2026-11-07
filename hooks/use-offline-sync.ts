'use client';

import { useEffect, useState } from 'react';
import {
  getOfflineSyncSnapshot,
  subscribeOfflineSync,
} from '@/lib/offline/syncManager';
import type { OfflineSyncSnapshot } from '@/lib/offline/types';

export function useOfflineSync(): OfflineSyncSnapshot {
  const [state, setState] = useState<OfflineSyncSnapshot>(() => getOfflineSyncSnapshot());

  useEffect(() => subscribeOfflineSync(setState), []);

  return state;
}
