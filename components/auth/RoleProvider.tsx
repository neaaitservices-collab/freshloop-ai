'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { StaffUser } from '@/lib/utils/roles';
import { syncRoleCookies } from '@/lib/utils/syncRoleCookies';

const STORAGE_KEY = 'freshloop-active-user';

interface RoleContextValue {
  users: StaffUser[];
  activeUser: StaffUser | null;
  loading: boolean;
  setActiveUserId: (id: string) => void;
  refresh: () => Promise<void>;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [activeUserId, setActiveUserIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const response = await fetch('/api/users', { cache: 'no-store' });
    const json = await response.json();
    const next = Array.isArray(json.users) ? (json.users as StaffUser[]) : [];
    setUsers(next);
    setActiveUserIdState((current) => {
      const stored = current ?? (typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null);
      if (stored && next.some((user) => user.id === stored)) return stored;
      return next.find((user) => user.role === 'ADMIN')?.id ?? next[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch {
        if (!cancelled) setUsers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const setActiveUserId = useCallback(
    (id: string) => {
      setActiveUserIdState(id);
      window.localStorage.setItem(STORAGE_KEY, id);
      const user = users.find((u) => u.id === id);
      if (user) syncRoleCookies(user.id, user.role);
    },
    [users]
  );

  const activeUser = users.find((user) => user.id === activeUserId) ?? null;

  useEffect(() => {
    if (activeUser) syncRoleCookies(activeUser.id, activeUser.role);
  }, [activeUser]);

  const value = useMemo(
    () => ({ users, activeUser, loading, setActiveUserId, refresh }),
    [users, activeUser, loading, setActiveUserId, refresh]
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const value = useContext(RoleContext);
  if (!value) {
    throw new Error('useRole must be used inside RoleProvider');
  }
  return value;
}
