import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';

/** Test-only setter. Production routes do not import this module. */
export function setOperationalStaffTestAuth(auth: (() => Promise<AuthSessionUser>) | null) {
  (globalThis as { __freshloopOperationalStaffTestAuth?: (() => Promise<AuthSessionUser>) | null }).__freshloopOperationalStaffTestAuth =
    auth;
}
