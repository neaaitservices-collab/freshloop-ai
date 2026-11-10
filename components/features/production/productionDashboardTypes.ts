import type { ProductionMobileSection } from '@/components/features/production/ProductionMobileSectionNav';
import type { ProductionBomSummary } from '@/components/features/production/ProductionBomKpiBadges';
import type { KitchenRecipeDefinition } from '@/lib/domains/manufacturing/types';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import type { RecipeFusionResult } from '@/lib/types';
import type { StoreScrapConfig, VolumetricScrapLoggedEvent } from '@/components/features/operations/VolumetricScrapForm';

export const RECIPE_CATALOG_FILTER_CATEGORIES = [
  'ALL',
  'Soup',
  'Panzanella',
  'Parfait',
  'Bakery',
] as const;

export type RecipeCatalogCategory = (typeof RECIPE_CATALOG_FILTER_CATEGORIES)[number];

export type ProductionDashboardMobileVisibility = {
  showMainColumn: boolean;
  showSidebar: boolean;
  showFloorTransfers: boolean;
  showRecipeCatalog: boolean;
  showBomPanel: boolean;
  showScrapForm: boolean;
};

export function productionMobileVisibility(
  section: ProductionMobileSection
): ProductionDashboardMobileVisibility {
  if (section === 'floor') {
    return {
      showMainColumn: true,
      showSidebar: false,
      showFloorTransfers: true,
      showRecipeCatalog: false,
      showBomPanel: false,
      showScrapForm: false,
    };
  }
  if (section === 'bom') {
    return {
      showMainColumn: true,
      showSidebar: false,
      showFloorTransfers: false,
      showRecipeCatalog: true,
      showBomPanel: true,
      showScrapForm: false,
    };
  }
  return {
    showMainColumn: false,
    showSidebar: true,
    showFloorTransfers: false,
    showRecipeCatalog: false,
    showBomPanel: false,
    showScrapForm: true,
  };
}

/** Re-export for sidebar wiring without circular imports. */
export type ProductionBomRailProps = {
  recipes: RecipeFusionResult[];
  manufacturingCatalog: KitchenRecipeDefinition[] | null;
  canEditBom: boolean;
  canExecuteBom: boolean;
  onSummaryChange: (summary: ProductionBomSummary) => void;
  onExecuteProduction: () => void;
  onPrintDeliLabel?: (recipe: RecipeFusionResult) => void;
  onEditRecipe: (recipe: RecipeFusionResult) => void;
  onBulkPrintDeliLabels?: (items: RecipeFusionResult[]) => void;
  onBrowseAll: () => void;
  onCreateBom?: () => void;
  loadError?: string | null;
};

export type ProductionScrapRailProps = {
  scrapStoreConfig: StoreScrapConfig | undefined;
  totalBucketsLoggedToday: number;
  onLogScrapBuckets: (
    bucketsDelta: number,
    event: VolumetricScrapLoggedEvent
  ) => void | Promise<void>;
  onResetBuckets: () => void;
};

export type ProductionFloorRailProps = {
  pullDays: number;
  initialLevels: StockLevel[] | null;
  mobileFillViewport: boolean;
};
