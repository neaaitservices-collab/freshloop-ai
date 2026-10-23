import { AppShell } from '@/components/layout/AppShell';
import { RouteSkeleton } from '@/components/ui/RouteSkeleton';

export default function KitchenLoading() {
  return (
    <AppShell>
      <RouteSkeleton variant="grid" />
    </AppShell>
  );
}
