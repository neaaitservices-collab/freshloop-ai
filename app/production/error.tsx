'use client';

import { RouteError } from '@/components/layout/RouteError';

export default function ProductionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError title="Production could not be loaded" error={error} reset={reset} />;
}
