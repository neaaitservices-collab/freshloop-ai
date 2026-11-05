'use client';

import React from 'react';
import type { RetailUnit } from '@/lib/domains/receiving/yieldPricing';
import { YieldPackInputs } from '@/components/ui/YieldPackInputs';

/** Yield, pack, and case floor — Admin inventory catalog only (not Receive). */
export function CatalogYieldPackFields({
  packSize,
  yieldDivisor,
  packUnit,
  yieldUnit,
  caseFloorPrice,
  onPackSize,
  onYieldDivisor,
  onPackUnit,
  onYieldUnit,
  onCaseFloorPrice,
}: {
  packSize: string;
  yieldDivisor: string;
  packUnit: RetailUnit;
  yieldUnit: RetailUnit;
  caseFloorPrice: string;
  onPackSize: (value: string) => void;
  onYieldDivisor: (value: string) => void;
  onPackUnit: (value: RetailUnit) => void;
  onYieldUnit: (value: RetailUnit) => void;
  onCaseFloorPrice: (value: string) => void;
}) {
  return (
    <YieldPackInputs
      ids={{
        packSize: 'catalog-pack-size',
        packUnit: 'catalog-pack-unit',
        caseFloor: 'catalog-case-floor-price',
        yieldDivisor: 'catalog-yield-divisor',
        yieldInto: 'catalog-yield-into-unit',
      }}
      packSize={packSize}
      yieldDivisor={yieldDivisor}
      packUnit={packUnit}
      yieldUnit={yieldUnit}
      caseFloorPrice={caseFloorPrice}
      onPackSize={onPackSize}
      onYieldDivisor={onYieldDivisor}
      onPackUnit={onPackUnit}
      onYieldUnit={onYieldUnit}
      onCaseFloorPrice={onCaseFloorPrice}
    />
  );
}
