import type { BundleDealEconomics } from '@/lib/domains/pricing/bundleDealEconomics';

export type FloorBundlePromoView = {
  id: string;
  productId: string;
  productName: string;
  minUnits: number;
  bundlePrice: number;
  label: string | null;
  isActive: boolean;
  updatedAt: string;
  economics: BundleDealEconomics;
};
