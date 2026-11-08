import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthError, getSessionUser } from '@/lib/auth/session';
import { decideFreshNavigation, FRESH_PATH_HEADER } from '@/lib/auth/pageAccess';
import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';

/**
 * Server boundary for a protected navigation, including client-side RSC requests.
 * The root layout is reused across transitions, so each protected segment calls this again.
 * Redirects before children render. Does not grant a role the page matrix denies.
 */
export async function guardFreshPage(knownPath?: string): Promise<AuthSessionUser> {
  const headerList = await headers();
  const pathname = knownPath ?? headerList.get(FRESH_PATH_HEADER) ?? '';
  let fresh: AuthSessionUser | null = null;
  try {
    fresh = await getSessionUser();
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  const decision = decideFreshNavigation(pathname, fresh);
  if (decision.action === 'redirect') {
    redirect(decision.location);
  }
  if (!fresh) {
    redirect('/login');
  }
  return fresh;
}
