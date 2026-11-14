'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Old admin bookmarks opened the catalogue with this hash. The catalogue is now /inventory. */
export function CatalogBookmarkRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (window.location.hash === '#inventory-catalog') {
      router.replace('/inventory');
    }
  }, [router]);

  return null;
}
