import { AppShell } from '@/components/layout/AppShell';
import { RouteSkeleton } from '@/components/ui/RouteSkeleton';

export default function AdminLoading() {
  return (
    <AppShell>
      <RouteSkeleton variant="grid" />
    </AppShell>
  );
}
