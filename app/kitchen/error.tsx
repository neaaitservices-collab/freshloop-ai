'use client';

import { RouteError } from '@/components/layout/RouteError';

export default function KitchenError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError title="Kitchen could not be loaded" error={error} reset={reset} />;
}
