'use client';

import { RouteError } from '@/components/layout/RouteError';

export default function SalesImportError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError title="Sales CSV could not be loaded" error={error} reset={reset} />;
}
