'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Navigation } from '@/components/layout/Navigation';
import { useRole } from '@/components/auth/RoleProvider';
import { canVisit, homeForRole } from '@/lib/utils/roles';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeUser, loading } = useRole();

  useEffect(() => {
    if (loading || !activeUser) return;
    if (!canVisit(activeUser.role, pathname)) {
      router.replace(homeForRole(activeUser.role));
    }
  }, [activeUser, loading, pathname, router]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 md:flex-row">
      <Navigation />
      <div className="flex min-w-0 flex-1 flex-col bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900/40 pb-[var(--freshloop-mobile-nav-h)] md:pb-0">
        {children}
      </div>
    </div>
  );
}
