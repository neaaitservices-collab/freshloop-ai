import { AppShell } from '@/components/layout/AppShell';
import { RouteSkeleton } from '@/components/ui/RouteSkeleton';

export default function FloorLoading() {
  return (
    <AppShell>
      <RouteSkeleton variant="default" />
    </AppShell>
  );
}
