'use client';

import React from 'react';
import { PageIntro } from '@/components/layout/PageIntro';
import { AdminViewTabs } from '@/components/features/admin/AdminViewTabs';
import { PageMain } from '@/components/ui/layout';

export function ExecutiveDashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PageMain className="py-4 pb-24 sm:py-6">
      <PageIntro
        step="Executive analytics"
        title="Business impact"
        description="Savings, ROI, and baseline vs optimized cost — tuned for leadership."
        action={<AdminViewTabs />}
      />
      <div className="mt-4 space-y-4">{children}</div>
    </PageMain>
  );
}
