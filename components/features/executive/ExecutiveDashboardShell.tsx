'use client';

import React from 'react';
import { PageIntro } from '@/components/layout/PageIntro';
import { AdminSectionHeader } from '@/components/features/admin/AdminSectionHeader';
import { PageMain } from '@/components/ui/layout';

export function ExecutiveDashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PageMain className="py-4 pb-24 sm:py-6">
      <AdminSectionHeader titleTag="p" />
      <PageIntro
        step="Executive analytics"
        title="Business impact"
        description="Savings, ROI, and baseline vs optimized cost — tuned for leadership."
      />
      <div className="mt-4 space-y-4">{children}</div>
    </PageMain>
  );
}
