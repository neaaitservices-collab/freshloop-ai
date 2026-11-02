'use client';

import React from 'react';
import { PageIntro } from '@/components/layout/PageIntro';
import { AdminViewTabs } from '@/components/features/admin/AdminViewTabs';

export function ExecutiveDashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-7xl px-3 py-4 pb-24 sm:px-6 sm:py-6">
      <PageIntro
        step="Executive analytics"
        title="Business impact"
        description="Savings, ROI, and baseline vs optimized cost — tuned for leadership."
        action={<AdminViewTabs />}
      />
      <div className="mt-4 space-y-4">{children}</div>
    </main>
  );
}
