'use client';

import { RouteError } from '@/components/layout/RouteError';

export default function InventoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError title="Inventory could not be loaded" error={error} reset={reset} />;
}
