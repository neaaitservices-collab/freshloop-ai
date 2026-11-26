'use client';

import { RouteError } from '@/components/layout/RouteError';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError title="Admin could not be loaded" error={error} reset={reset} />;
}
