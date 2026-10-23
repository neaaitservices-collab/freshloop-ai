import { ROLE_COOKIE, USER_ID_COOKIE } from '@/lib/utils/roleRouting';
import type { RoleName } from '@/lib/utils/roles';

/** Persist acting role for Edge middleware (`/` redirect). */
export function syncRoleCookies(userId: string, role: RoleName) {
  if (typeof document === 'undefined') return;
  const maxAge = 60 * 60 * 24 * 365;
  const base = `path=/; max-age=${maxAge}; SameSite=Lax`;
  document.cookie = `${ROLE_COOKIE}=${encodeURIComponent(role)}; ${base}`;
  document.cookie = `${USER_ID_COOKIE}=${encodeURIComponent(userId)}; ${base}`;
}

export function clearRoleCookies() {
  if (typeof document === 'undefined') return;
  const expire = 'path=/; max-age=0; SameSite=Lax';
  document.cookie = `${ROLE_COOKIE}=; ${expire}`;
  document.cookie = `${USER_ID_COOKIE}=; ${expire}`;
}
