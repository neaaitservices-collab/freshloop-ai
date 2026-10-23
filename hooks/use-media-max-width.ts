'use client';

import { useEffect, useState } from 'react';

/** True when viewport width is at most `maxPx` (matches Tailwind `md` at 768 by default). */
export function useMediaMaxWidth(maxPx = 768): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxPx}px)`);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [maxPx]);

  return matches;
}
