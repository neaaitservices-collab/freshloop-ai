import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';

/** Test-only setter. Production routes do not import this module. */
export function setAdminStaffTestAuth(auth: (() => Promise<AuthSessionUser>) | null) {
  (globalThis as { __freshloopAdminStaffTestAuth?: (() => Promise<AuthSessionUser>) | null }).__freshloopAdminStaffTestAuth =
    auth;
}
