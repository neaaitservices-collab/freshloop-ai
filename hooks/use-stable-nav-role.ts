'use client';

import { useEffect, useState } from 'react';
import { useRole } from '@/components/auth/RoleProvider';
import { isRoleName, type RoleName } from '@/lib/utils/roles';

const STORAGE_KEY = 'freshloop-nav-role';

function readCachedNavRole(): RoleName | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw && isRoleName(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Keeps navigation role stable across session hydration to prevent item list flicker.
 */
export function useStableNavRole(): {
  role: RoleName | null;
  sessionPending: boolean;
} {
  const { activeUser, loading } = useRole();
  /** Null on server and first client paint — read storage only after mount (avoids hydration mismatch). */
  const [bootRole, setBootRole] = useState<RoleName | null>(null);

  useEffect(() => {
    const cached = readCachedNavRole();
    if (cached) setBootRole(cached);
  }, []);

  useEffect(() => {
    if (!activeUser?.role) return;
    setBootRole(activeUser.role);
    try {
      sessionStorage.setItem(STORAGE_KEY, activeUser.role);
    } catch {
      /* ignore quota / private mode */
    }
  }, [activeUser?.role]);

  if (activeUser?.role) {
    return { role: activeUser.role, sessionPending: false };
  }

  if (loading) {
    return { role: bootRole, sessionPending: true };
  }

  return { role: null, sessionPending: false };
}
