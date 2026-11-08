'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceRecorderModal } from '@/components/features/voice/VoiceRecorderModal';
import { useRegisterAppVoice } from '@/components/layout/AppVoiceOverrideContext';
import { VOICE_UI_ENABLED } from '@/lib/features/voiceUiEnabled';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { stashInvoiceForReceiving } from '@/lib/domains/receiving/receivingBridge';
import type { InvoiceOcrResult } from '@/lib/types';
import { useRole } from '@/components/auth/RoleProvider';
import {
  type ProductionBomSummary,
} from '@/components/features/production/ProductionBomKpiBadges';
import { ProductionDashboardHeader } from '@/components/features/production/ProductionDashboardHeader';
import { ProductionBomSection } from '@/components/features/production/ProductionBomSection';
import { ProductionDashboardSidebar } from '@/components/features/production/ProductionDashboardSidebar';
import { ProductionFloorTransfersSection } from '@/components/features/production/ProductionFloorTransfersSection';
import { ProductionRecipeCatalogSection } from '@/components/features/production/ProductionRecipeCatalogSection';
import {
  productionMobileVisibility,
  type RecipeCatalogCategory,
} from '@/components/features/production/productionDashboardTypes';
import { PageMain } from '@/components/ui/layout';
import { PRODUCTION_DELI_LABEL_PRINT_ENABLED } from '@/components/features/production/productionFeatureFlags';
import {
  LazyDeliLabelModal,
  LazyInvoiceUploadModal,
  LazyManualRecipeCreatorModal,
  LazyRecipeProductionModal,
} from '@/components/modals/lazyModals';
import { useProductionWasteKpi } from '@/hooks/use-production-waste-kpi';
import { RecipeFusionResult } from '@/lib/types';
import { mapDbRecipeToFusionResult } from '@/lib/domains/manufacturing/mapDbRecipeToFusion';
import type { KitchenRecipeDefinition } from '@/lib/domains/manufacturing/types';
import type { ProductionBootstrapData } from '@/lib/domains/manufacturing/productionBootstrap';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import {
  FRESHLOOP_SETTINGS_UPDATED,
  readSettingsUpdatedEvent,
} from '@/lib/domains/stats/settingsEvents';
import type { ProductionBatchExecutedSummary } from '@/components/features/recipes/RecipeProductionModal';
import { Toast } from '@/components/ui/Toast';
import {
  type ProductionMobileSection,
} from '@/components/features/production/ProductionMobileSectionNav';
import { cn } from '@/lib/utils/cn';
import {
  canEditProductionBom,
  canExecuteProductionBatch,
} from '@/lib/auth/staffCapabilities';

function ProductionDashboardContent() {
  const router = useRouter();
  const catalogRef = useRef<HTMLDetailsElement>(null);

  const { activeUser } = useRole();
  const canEditBom = canEditProductionBom(activeUser?.role);
  const canExecuteBom = canExecuteProductionBatch(activeUser?.role);
  const {
    wasteKpi,
    scrapStoreConfig,
    syncing,
    wasteKpiRefreshError,
    refreshWasteKpi,
    logVolumetricScrap,
    applyBootstrap,
  } = useProductionWasteKpi({ deferInitialFetch: true });

  const [recipes, setRecipes] = useState<RecipeFusionResult[]>([]);
  const [savedRecipeCount, setSavedRecipeCount] = useState(0);
  const [manufacturingCatalog, setManufacturingCatalog] = useState<
    KitchenRecipeDefinition[] | null
  >(null);
  const [initialTransferLevels, setInitialTransferLevels] = useState<StockLevel[] | null>(
    null
  );
  const [selectedCategory, setSelectedCategory] = useState<RecipeCatalogCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [fusionError, setFusionError] = useState<string | null>(null);
  const [scrapToast, setScrapToast] = useState<string | null>(null);

  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isCreateRecipeModalOpen, setIsCreateRecipeModalOpen] = useState(false);
  const [editRecipeId, setEditRecipeId] = useState<string | null>(null);
  const [selectedDeliRecipe, setSelectedDeliRecipe] = useState<RecipeFusionResult | null>(null);
  const deliPrintQueueRef = useRef<RecipeFusionResult[]>([]);
  const [productionOpen, setProductionOpen] = useState(false);
  const [productionRecipeId, setProductionRecipeId] = useState<string | undefined>();
  const [batchToast, setBatchToast] = useState<string | null>(null);
  const [pullSensitivityDays, setPullSensitivityDays] = useState<2 | 3 | 4>(3);
  const [bomSummary, setBomSummary] = useState<ProductionBomSummary>({
    totalRecipes: 0,
    belowPar: 0,
    totalYield: 0,
    avgMargin: 0,
  });
  const [mobileSection, setMobileSection] = useState<ProductionMobileSection>('bom');
  const [voiceRecorderOpen, setVoiceRecorderOpen] = useState(false);

  const openVoiceRecorder = useCallback(() => setVoiceRecorderOpen(true), []);
  useRegisterAppVoice(VOICE_UI_ENABLED ? openVoiceRecorder : null);

  const sectionVisibility = productionMobileVisibility(mobileSection);

  const fetchRecipes = useCallback(async () => {
    try {
      const bomRes = await fetch('/api/recipes', { cache: 'no-store' });
      const bomJson = (await bomRes.json()) as {
        success?: boolean;
        recipes?: Parameters<typeof mapDbRecipeToFusionResult>[0][];
      };
      if (bomJson.success && Array.isArray(bomJson.recipes) && bomJson.recipes.length > 0) {
        setSavedRecipeCount(bomJson.recipes.length);
        setRecipes(bomJson.recipes.map(mapDbRecipeToFusionResult));
      } else {
        setRecipes([]);
        setSavedRecipeCount(0);
      }
    } catch {
      /* keep cached */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/production/bootstrap', { cache: 'no-store' });
        const json = (await res.json()) as { success?: boolean } & Partial<ProductionBootstrapData>;
        if (cancelled) return;
        if (res.ok && json.success && json.wasteKpi && json.storeSettings) {
          setRecipes(Array.isArray(json.recipes) ? json.recipes : []);
          setSavedRecipeCount(
            typeof json.savedRecipeCount === 'number'
              ? json.savedRecipeCount
              : Array.isArray(json.recipes)
                ? json.recipes.length
                : 0
          );
          setManufacturingCatalog(
            Array.isArray(json.manufacturingRecipes) ? json.manufacturingRecipes : []
          );
          setInitialTransferLevels(
            Array.isArray(json.levelsSummary) ? json.levelsSummary : []
          );
          const days = json.storeSettings.pullSensitivityDays;
          if (days === 2 || days === 3 || days === 4) setPullSensitivityDays(days);
          applyBootstrap({
            wasteKpi: json.wasteKpi,
            storeSettings: json.storeSettings,
          });
          return;
        }
      } catch {
        /* fallback below */
      }
      if (cancelled) return;
      void fetchRecipes();
      void refreshWasteKpi(true);
    })();

    const onSettings = (event: Event) => {
      const saved = readSettingsUpdatedEvent(event);
      const days = saved?.pullSensitivityDays;
      if (days === 2 || days === 3 || days === 4) setPullSensitivityDays(days);
    };
    window.addEventListener(FRESHLOOP_SETTINGS_UPDATED, onSettings);
    return () => {
      cancelled = true;
      window.removeEventListener(FRESHLOOP_SETTINGS_UPDATED, onSettings);
    };
  }, [applyBootstrap, fetchRecipes, refreshWasteKpi]);

  const scrollToCatalog = useCallback(() => {
    catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleBulkPrintDeliLabels = useCallback((items: RecipeFusionResult[]) => {
    if (items.length === 0) return;
    deliPrintQueueRef.current = items.slice(1);
    setSelectedDeliRecipe(items[0] ?? null);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#0b0f19] font-sans text-slate-100 selection:bg-emerald-500">
      {scrapToast ? (
        <div
          className="fixed bottom-20 left-3 right-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-emerald-400/50 bg-emerald-950/95 px-4 py-3 text-emerald-200 shadow-2xl backdrop-blur-xl sm:bottom-6 sm:left-auto sm:right-4"
          role="status"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
          <p className="text-xs font-bold text-white">{scrapToast}</p>
        </div>
      ) : null}

      <PageMain width="wide" className="relative w-full py-3 sm:py-5 sm:pb-8">
        <ProductionDashboardHeader
          bomSummary={bomSummary}
          mobileSection={mobileSection}
          onMobileSectionChange={setMobileSection}
          canEditBom={canEditBom}
          canExecuteBom={canExecuteBom}
          onNewBom={() => {
            setEditRecipeId(null);
            setIsCreateRecipeModalOpen(true);
          }}
          onExecuteBatch={() => {
            setProductionRecipeId(undefined);
            setProductionOpen(true);
          }}
          onScrollToCatalog={scrollToCatalog}
          syncing={syncing}
          wasteKpiRefreshError={wasteKpiRefreshError}
          onVoiceNote={VOICE_UI_ENABLED ? openVoiceRecorder : undefined}
        />

        <div className="relative z-0 mt-4 grid grid-cols-1 gap-4 lg:mt-6 lg:grid-cols-3 lg:gap-6 lg:items-start">
          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden lg:col-span-2',
              !sectionVisibility.showMainColumn && 'hidden lg:flex'
            )}
          >
            <ProductionFloorTransfersSection
              pullDays={pullSensitivityDays}
              initialLevels={initialTransferLevels}
              mobileFillViewport={mobileSection === 'floor'}
              className={cn(!sectionVisibility.showFloorTransfers && 'hidden lg:block')}
            />

            <ProductionBomSection
              recipes={recipes}
              manufacturingCatalog={manufacturingCatalog}
              canEditBom={canEditBom}
              canExecuteBom={canExecuteBom}
              onSummaryChange={setBomSummary}
              onExecuteProduction={() => {
                setProductionRecipeId(undefined);
                setProductionOpen(true);
              }}
              onEditRecipe={(r) => {
                if (!canEditBom) return;
                setEditRecipeId(r.id);
                setIsCreateRecipeModalOpen(true);
              }}
              {...(PRODUCTION_DELI_LABEL_PRINT_ENABLED
                ? {
                    onPrintDeliLabel: setSelectedDeliRecipe,
                    onBulkPrintDeliLabels: handleBulkPrintDeliLabels,
                  }
                : {})}
              onBrowseAll={scrollToCatalog}
              onCreateBom={
                canEditBom
                  ? () => {
                      setEditRecipeId(null);
                      setIsCreateRecipeModalOpen(true);
                    }
                  : undefined
              }
              className={cn(!sectionVisibility.showBomPanel && 'hidden lg:block')}
            />

            <ProductionRecipeCatalogSection
              ref={catalogRef}
              savedRecipeCount={savedRecipeCount}
              recipes={recipes}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              canExecuteBom={canExecuteBom}
              onOpenDeliModal={
                PRODUCTION_DELI_LABEL_PRINT_ENABLED ? setSelectedDeliRecipe : undefined
              }
              onExecuteBatch={(r) => {
                setProductionRecipeId(r.id);
                setProductionOpen(true);
              }}
              className={cn(!sectionVisibility.showRecipeCatalog && 'hidden lg:block')}
            />
          </div>

          <ProductionDashboardSidebar
            className={cn('lg:col-span-1', !sectionVisibility.showSidebar && 'hidden lg:flex')}
            scrapStoreConfig={scrapStoreConfig}
            totalBucketsLoggedToday={wasteKpi?.volumetricScrapBucketsCount ?? 0}
            showScrapForm={sectionVisibility.showScrapForm}
            onLogScrapBuckets={async (bucketsDelta, event) => {
              await logVolumetricScrap(bucketsDelta, event);
              setScrapToast(
                `Volumetric scrap: +${bucketsDelta} bucket(s) · ${event.estimatedWeightKg} kg · $${event.estimatedScrapCostValue.toFixed(2)}`
              );
              window.setTimeout(() => setScrapToast(null), 4000);
            }}
            onResetBuckets={() => void refreshWasteKpi(true)}
          />
        </div>
      </PageMain>

      {VOICE_UI_ENABLED ? (
        <VoiceRecorderModal
          isOpen={voiceRecorderOpen}
          onClose={() => setVoiceRecorderOpen(false)}
          onVoiceLogged={() => {
            void fetchRecipes();
          }}
        />
      ) : null}

      <LazyInvoiceUploadModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        onInvoiceImported={(result: InvoiceOcrResult) => {
          stashInvoiceForReceiving(result);
          setIsInvoiceModalOpen(false);
          router.push('/receive');
        }}
      />

      {PRODUCTION_DELI_LABEL_PRINT_ENABLED ? (
        <LazyDeliLabelModal
          isOpen={!!selectedDeliRecipe}
          onClose={() => {
            const next = deliPrintQueueRef.current.shift();
            if (next) {
              setSelectedDeliRecipe(next);
            } else {
              setSelectedDeliRecipe(null);
            }
          }}
          recipe={selectedDeliRecipe}
        />
      ) : null}

      <LazyManualRecipeCreatorModal
        isOpen={isCreateRecipeModalOpen}
        editRecipeId={editRecipeId}
        onClose={() => {
          setIsCreateRecipeModalOpen(false);
          setEditRecipeId(null);
        }}
        onRecipeCreated={() => {
          setBatchToast('Recipe created with Bill of Materials.');
          void fetchRecipes();
        }}
        onRecipeUpdated={() => {
          setBatchToast('Recipe updated.');
          void fetchRecipes();
        }}
      />

      <LazyRecipeProductionModal
        isOpen={productionOpen}
        initialRecipeId={productionRecipeId}
        onClose={() => setProductionOpen(false)}
        onBatchProduced={(summary: ProductionBatchExecutedSummary) => {
          setBatchToast(
            `Batch logged: +${summary.batchOutputQty} × ${summary.outputProductName} (Production Prep)`
          );
          void fetchRecipes();
        }}
        onBatchFailed={(message) => setFusionError(message)}
      />

      <Toast message={batchToast} onDismiss={() => setBatchToast(null)} variant="success" />
      <Toast message={fusionError} onDismiss={() => setFusionError(null)} variant="destructive" />
    </div>
  );
}

export function ProductionDashboard() {
  return <ProductionDashboardContent />;
}
