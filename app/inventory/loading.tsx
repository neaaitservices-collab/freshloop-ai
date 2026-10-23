import { AppShell } from '@/components/layout/AppShell';
import { RouteSkeleton } from '@/components/ui/RouteSkeleton';

export default function InventoryLoading() {
  return (
    <AppShell>
      <RouteSkeleton variant="table" />
    </AppShell>
  );
}
