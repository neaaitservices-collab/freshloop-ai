import { AppShell } from '@/components/layout/AppShell';
import { RouteSkeleton } from '@/components/ui/RouteSkeleton';

export default function RootLoading() {
  return (
    <AppShell>
      <RouteSkeleton />
    </AppShell>
  );
}
