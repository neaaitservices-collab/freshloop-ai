import { RouteSkeleton, type RouteSkeletonVariant } from '@/components/ui/RouteSkeleton';

/**
 * Route loading UI only — do not mount AppShell here.
 * AppShell belongs in segment layout.tsx so Navigation is not torn down during loading → page swaps.
 */
export function AppLoadingFallback({
  variant = 'default',
}: {
  variant?: RouteSkeletonVariant;
}) {
  return (
    <div className="min-h-[50vh] flex-1 pb-20 md:pb-0">
      <RouteSkeleton variant={variant} />
    </div>
  );
}
