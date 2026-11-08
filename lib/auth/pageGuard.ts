import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthError, getSessionUser } from '@/lib/auth/session';
import { decideFreshNavigation, FRESH_PATH_HEADER } from '@/lib/auth/pageAccess';
import type { AuthSessionUser } from '@/lib/auth/staffSnapshot';

/**
 * Server boundary for one protected URL.
 * Segment layouts do not re-render for a child route of the same segment
 * (`/admin` to `/admin/settings`, `/inventory/floor` to `/inventory`).
 * Call this with that page's path before any sensitive read in the page or its loader.
 * A layout redirect does not, by itself, stop a loader that has already started.
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
