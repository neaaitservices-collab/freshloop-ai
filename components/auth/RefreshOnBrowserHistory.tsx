'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Back/Forward can restore a router payload fetched under an older role.
 * Ask the server to render the URL again. The previous screen can remain
 * until that response replaces it.
 */
export function RefreshOnBrowserHistory() {
  const router = useRouter();
  useEffect(() => {
    const onPop = () => {
      router.refresh();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [router]);
  return null;
}
