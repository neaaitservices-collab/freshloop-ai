'use client';

import React from 'react';
import { VolumetricScrapForm } from '@/components/features/operations/VolumetricScrapForm';
import type { ProductionScrapRailProps } from '@/components/features/production/productionDashboardTypes';
import { cn } from '@/lib/utils/cn';

export type ProductionDashboardSidebarProps = ProductionScrapRailProps & {
  showScrapForm: boolean;
  className?: string;
};

export function ProductionDashboardSidebar({
  scrapStoreConfig,
  totalBucketsLoggedToday,
  onLogScrapBuckets,
  onResetBuckets,
  showScrapForm,
  className,
}: ProductionDashboardSidebarProps) {
  return (
    <aside
      className={cn(
        'relative z-0 flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain',
        className
      )}
    >
      <div
        className={cn(
          'relative min-w-0 overflow-hidden',
          showScrapForm ? 'block' : 'hidden lg:block'
        )}
      >
        <VolumetricScrapForm
          compact
          storeConfig={scrapStoreConfig}
          totalBucketsLoggedToday={totalBucketsLoggedToday}
          onLogScrapBuckets={onLogScrapBuckets}
          onResetBuckets={onResetBuckets}
        />
      </div>
    </aside>
  );
}
