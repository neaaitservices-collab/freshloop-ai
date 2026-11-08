'use client';

import { useLayoutEffect } from 'react';
import { useRole } from '@/components/auth/RoleProvider';
import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';

/**
 * Copies the staff row from the server segment that just rendered.
 * This is navigation state for the shell, not the authorization check.
 */
export function FreshSessionSync({ user }: { user: AuthSessionUser }) {
  const { applyServerUser } = useRole();
  useLayoutEffect(() => {
    applyServerUser({
      id: user.id,
      name: user.name,
      email: user.email,
      position: user.position,
      role: user.role,
      hourlyRate: user.hourlyRate,
    });
  }, [
    applyServerUser,
    user.id,
    user.name,
    user.email,
    user.position,
    user.role,
    user.hourlyRate,
  ]);
  return null;
}
