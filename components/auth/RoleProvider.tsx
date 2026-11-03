'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { SessionProvider, signOut, useSession } from 'next-auth/react';
import type { StaffUser } from '@/lib/utils/roles';
import { isManager, isRoleName } from '@/lib/utils/roles';

interface RoleContextValue {
  users: StaffUser[];
  activeUser: StaffUser | null;
  loading: boolean;
  /** @deprecated Demo impersonation removed — triggers sign-out. */
  setActiveUserId: (id: string) => void;
  refresh: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const RoleContext = createContext<RoleContextValue | null>(null);

function mapSessionUser(session: ReturnType<typeof useSession>['data']): StaffUser | null {
  const user = session?.user;
  if (!user?.id || !user.email) return null;
  const role = user.role && isRoleName(user.role) ? user.role : null;
  if (!role) return null;
  const rate = user.hourlyRate;
  return {
    id: user.id,
    name: user.name ?? '',
    email: user.email,
    position: user.position ?? '',
    role,
    hourlyRate:
      typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null,
  };
}

function RoleContextInner({ children }: { children: React.ReactNode }) {
  const { data: session, status, update } = useSession();
  const loading = status === 'loading';
  const activeUser = useMemo(() => mapSessionUser(session), [session]);
  const [users, setUsers] = useState<StaffUser[]>([]);

  const loadStaffDirectory = useCallback(async () => {
    if (!activeUser || !isManager(activeUser.role)) {
      setUsers(activeUser ? [activeUser] : []);
      return;
    }
    try {
      const response = await fetch('/api/users', { cache: 'no-store' });
      const json = await response.json();
      if (json.success && Array.isArray(json.users)) {
        setUsers(json.users as StaffUser[]);
      } else {
        setUsers(activeUser ? [activeUser] : []);
      }
    } catch {
      setUsers(activeUser ? [activeUser] : []);
    }
  }, [activeUser]);

  useEffect(() => {
    void loadStaffDirectory();
  }, [loadStaffDirectory]);

  const refresh = useCallback(async () => {
    await update();
    await loadStaffDirectory();
  }, [update, loadStaffDirectory]);

  const signOutUser = useCallback(async () => {
    await signOut({ callbackUrl: '/login' });
  }, []);

  const setActiveUserId = useCallback(
    (id: string) => {
      if (activeUser?.id === id) return;
      void signOutUser();
    },
    [activeUser?.id, signOutUser]
  );

  const value = useMemo(
    () => ({
      users,
      activeUser,
      loading,
      setActiveUserId,
      refresh,
      signOutUser,
    }),
    [users, activeUser, loading, setActiveUserId, refresh, signOutUser]
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <RoleContextInner>{children}</RoleContextInner>
    </SessionProvider>
  );
}

export function useRole(): RoleContextValue {
  const value = useContext(RoleContext);
  if (!value) {
    throw new Error('useRole must be used inside RoleProvider');
  }
  return value;
}
