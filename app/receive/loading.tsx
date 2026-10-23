import { AppShell } from '@/components/layout/AppShell';
import { RouteSkeleton } from '@/components/ui/RouteSkeleton';

export default function ReceiveLoading() {
  return (
    <AppShell>
      <RouteSkeleton variant="table" />
    </AppShell>
  );
}
