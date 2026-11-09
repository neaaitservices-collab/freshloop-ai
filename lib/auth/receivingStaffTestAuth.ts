import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';

/** Test-only setter. Production routes do not import this module. */
export function setReceivingStaffTestAuth(auth: (() => Promise<AuthSessionUser>) | null) {
  (globalThis as { __freshloopReceivingStaffTestAuth?: (() => Promise<AuthSessionUser>) | null }).__freshloopReceivingStaffTestAuth =
    auth;
}
