'use client';

import React, { Suspense } from 'react';
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

const RescueOutcomeChartDynamic = dynamic<RescueProps>(
  () =>
    import('@/components/features/admin/RescueOutcomeChart').then((m) => m.RescueOutcomeChart),
  { ssr: false }
);

const DepartmentAlertsChartDynamic = dynamic<DeptProps>(
  () =>
    import('@/components/features/admin/DepartmentAlertsChart').then(
      (m) => m.DepartmentAlertsChart
    ),
  { ssr: false }
);

export function LazyRescueOutcomeChart(props: RescueProps) {
  return (
    <Suspense
      fallback={
        <ChartSkeleton className="min-h-[360px] rounded-2xl border border-slate-800 bg-slate-900/50" />
      }
    >
      <RescueOutcomeChartDynamic {...props} />
    </Suspense>
  );
}

export function LazyDepartmentAlertsChart(props: DeptProps) {
  return (
    <Suspense fallback={<ChartSkeleton />}>
      <DepartmentAlertsChartDynamic {...props} />
    </Suspense>
  );
}
