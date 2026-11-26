'use client';

import { RouteError } from '@/components/layout/RouteError';

export default function OperationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError title="Operations could not be loaded" error={error} reset={reset} />;
}
