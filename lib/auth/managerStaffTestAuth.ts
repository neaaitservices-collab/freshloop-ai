import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';

/** Test-only setter. Production routes do not import this module. */
export function setManagerStaffTestAuth(auth: (() => Promise<AuthSessionUser>) | null) {
  (globalThis as { __freshloopManagerStaffTestAuth?: (() => Promise<AuthSessionUser>) | null }).__freshloopManagerStaffTestAuth =
    auth;
}
