'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';

function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={
        className ??
        'min-h-[280px] animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50'
      }
      aria-hidden
    />
  );
}

type RescueProps = ComponentProps<
  typeof import('@/components/features/admin/RescueOutcomeChart').RescueOutcomeChart
>;
type DeptProps = ComponentProps<
  typeof import('@/components/features/admin/DepartmentAlertsChart').DepartmentAlertsChart
>;

export const LazyRescueOutcomeChart = dynamic<RescueProps>(
  () =>
    import('@/components/features/admin/RescueOutcomeChart').then((m) => m.RescueOutcomeChart),
  {
    loading: () => <ChartSkeleton className="min-h-[360px] rounded-2xl border border-slate-800 bg-slate-900/50" />,
    ssr: false,
  }
);

export const LazyDepartmentAlertsChart = dynamic<DeptProps>(
  () =>
    import('@/components/features/admin/DepartmentAlertsChart').then(
      (m) => m.DepartmentAlertsChart
    ),
  {
    loading: () => <ChartSkeleton />,
    ssr: false,
  }
);
