import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';

/** Test-only setter. Production routes do not import this module. */
export function setKitchenStaffTestAuth(auth: (() => Promise<AuthSessionUser>) | null) {
  (globalThis as { __freshloopKitchenStaffTestAuth?: (() => Promise<AuthSessionUser>) | null }).__freshloopKitchenStaffTestAuth =
    auth;
}
