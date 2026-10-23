import { AppShell } from '@/components/layout/AppShell';
import { RouteSkeleton } from '@/components/ui/RouteSkeleton';

export default function OperationsLoading() {
  return (
    <AppShell>
      <RouteSkeleton variant="table" />
    </AppShell>
  );
}
