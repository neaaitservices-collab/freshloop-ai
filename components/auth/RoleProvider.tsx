'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Session } from 'next-auth';
import { SessionProvider, signOut, useSession } from 'next-auth/react';
import type { StaffUser } from '@/lib/utils/roles';
import { isManager, isRoleName } from '@/lib/utils/roles';

interface RoleContextValue {
  users: StaffUser[];
  activeUser: StaffUser | null;
  loading: boolean;
  /** @deprecated Demo impersonation removed — triggers sign-out. */
  setActiveUserId: (id: string) => void;
  /** Latest staff row from the server segment that just rendered. */
  applyServerUser: (user: StaffUser | null) => void;
  refresh: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const RoleContext = createContext<RoleContextValue | null>(null);

let inflightUsersPromise: Promise<StaffUser[] | null> | null = null;

async function fetchUsersCoalesced(): Promise<StaffUser[] | null> {
  if (inflightUsersPromise) return inflightUsersPromise;
  inflightUsersPromise = fetch('/api/users', { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) return null;
      const json = await response.json();
      if (json?.success && Array.isArray(json.users)) {
        return json.users as StaffUser[];
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      inflightUsersPromise = null;
    });
  return inflightUsersPromise;
}

function RoleContextInner({ children }: { children: React.ReactNode }) {
  const { data: session, status, update } = useSession();
  const loading = status === 'loading';

  const userId = session?.user?.id ?? '';
  const userEmail = session?.user?.email ?? '';
  const userName = session?.user?.name ?? '';
  const userPosition = session?.user?.position ?? '';
  const userRoleRaw = session?.user?.role ?? '';
  const userHourlyRate = session?.user?.hourlyRate;

  const sessionUser = useMemo<StaffUser | null>(() => {
    if (!userId || !userEmail) return null;
    const role = userRoleRaw && isRoleName(userRoleRaw) ? userRoleRaw : null;
    if (!role) return null;
    return {
      id: userId,
      name: userName,
      email: userEmail,
      position: userPosition,
      role,
      hourlyRate:
        typeof userHourlyRate === 'number' &&
        Number.isFinite(userHourlyRate) &&
        userHourlyRate > 0
          ? userHourlyRate
          : null,
    };
  }, [userId, userEmail, userName, userPosition, userRoleRaw, userHourlyRate]);

  const [serverUser, setServerUser] = useState<StaffUser | null | undefined>(undefined);
  const applyServerUser = useCallback((user: StaffUser | null) => {
    setServerUser((current) => {
      if (
        current &&
        user &&
        current.id === user.id &&
        current.role === user.role &&
        current.email === user.email &&
        current.name === user.name &&
        current.position === user.position
      ) {
        return current;
      }
      if (current === null && user === null) return current;
      return user;
    });
  }, []);
  const activeUser = serverUser !== undefined ? serverUser : sessionUser;

  const [users, setUsers] = useState<StaffUser[]>([]);
  const loadedForUserIdRef = useRef<string | null>(null);

  const loadStaffDirectory = useCallback(async () => {
    if (!activeUser || !isManager(activeUser.role)) {
      setUsers(activeUser ? [activeUser] : []);
      return;
    }
    const list = await fetchUsersCoalesced();
    if (list) {
      setUsers(list);
    } else {
      setUsers([activeUser]);
    }
  }, [activeUser]);

  useEffect(() => {
    if (!activeUser) {
      loadedForUserIdRef.current = null;
      setUsers([]);
      return;
    }
    if (!isManager(activeUser.role)) {
      loadedForUserIdRef.current = activeUser.id;
      setUsers([activeUser]);
      return;
    }
    if (loadedForUserIdRef.current === activeUser.id) return;
    loadedForUserIdRef.current = activeUser.id;
    void loadStaffDirectory();
  }, [activeUser, loadStaffDirectory]);

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
      applyServerUser,
      refresh,
      signOutUser,
    }),
    [users, activeUser, loading, setActiveUserId, applyServerUser, refresh, signOutUser]
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function RoleProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session?: Session | null;
}) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false}>
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
