import { getSession } from 'next-auth/react';

/** Credentials sign-in can return before the browser applies Set-Cookie; poll before navigating. */
export async function waitForClientSession(maxWaitMs = 3000): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const session = await getSession();
    if (session?.user?.id) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const last = await getSession();
  return Boolean(last?.user?.id);
}
