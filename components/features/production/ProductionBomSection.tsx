'use client';

import React from 'react';
import { ProductionActiveBomPanel } from '@/components/features/production/ProductionActiveBomPanel';
import type { ProductionBomRailProps } from '@/components/features/production/productionDashboardTypes';
import { cn } from '@/lib/utils/cn';

export type ProductionBomSectionProps = ProductionBomRailProps & {
  className?: string;
};

export function ProductionBomSection({ className, ...bomProps }: ProductionBomSectionProps) {
  return (
    <section
      className={cn('relative z-0 min-w-0 overflow-hidden', className)}
      aria-label="Active BOM and grab-and-go labels"
    >
      <ProductionActiveBomPanel {...bomProps} layout="wide" />
    </section>
  );
}
