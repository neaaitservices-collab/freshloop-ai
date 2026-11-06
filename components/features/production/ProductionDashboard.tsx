'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { stashInvoiceForReceiving } from '@/lib/domains/receiving/receivingBridge';
import type { InvoiceOcrResult } from '@/lib/types';
import { useRole } from '@/components/auth/RoleProvider';
import { RecipeFusionCard } from '@/components/features/recipes/RecipeFusionCard';
import {
  ProductionBomKpiBadges,
  type ProductionBomSummary,
} from '@/components/features/production/ProductionBomKpiBadges';
import { PageMain } from '@/components/ui/layout';
import { InvoiceUploadModal } from '@/components/features/invoices/InvoiceUploadModal';
import { DeliLabelModal } from '@/components/features/recipes/DeliLabelModal';
import { LiveSubInventoryTransfers } from '@/components/features/inventory/LiveSubInventoryTransfers';
import { ProductionActiveBomPanel } from '@/components/features/production/ProductionActiveBomPanel';
import {
  VolumetricScrapForm,
} from '@/components/features/operations/VolumetricScrapForm';
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
import {
  RecipeProductionModal,
  type ProductionBatchExecutedSummary,
} from '@/components/features/recipes/RecipeProductionModal';
import { ManualRecipeCreatorModal } from '@/components/features/recipes/ManualRecipeCreatorModal';
import { Search, ChefHat, Plus, CheckCircle2, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Toast } from '@/components/ui/Toast';
import {
  ProductionMobileSectionNav,
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
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
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

  const fetchRecipes = useCallback(async () => {
    try {
      const bomRes = await fetch('/api/recipes', { cache: 'no-store' });
      const bomJson = await bomRes.json();

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

  const filteredRecipes = recipes.filter((r) => {
    const matchesSearch =
      r.recipeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat =
      selectedCategory === 'ALL' ||
      r.category.toLowerCase().includes(selectedCategory.toLowerCase());
    return matchesSearch && matchesCat;
  });

  const scrollToCatalog = () => {
    catalogRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 font-sans text-slate-100 selection:bg-emerald-500">
      {scrapToast ? (
        <div className="fixed bottom-20 left-3 right-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-emerald-400/50 bg-emerald-950/95 px-4 py-3 text-emerald-200 shadow-2xl backdrop-blur-xl sm:bottom-6 sm:left-auto sm:right-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          <p className="text-xs font-bold text-white">{scrapToast}</p>
        </div>
      ) : null}

      <PageMain width="wide" className="py-3 sm:py-5 sm:pb-8">
        <div className="sticky top-0 z-30 -mx-3 space-y-3 border-b border-slate-800/80 bg-slate-950/95 px-3 pb-3 pt-1 backdrop-blur-md sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:space-y-4 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <header className="rounded-2xl border border-slate-800/90 bg-slate-900/60 p-4 lg:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                  Production Operations
                </p>
                <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl lg:text-3xl">
                  Production Dashboard
                </h1>
                <ProductionBomKpiBadges summary={bomSummary} />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap xl:max-w-md xl:justify-end">
                {canEditBom ? (
                  <Button
                    variant="secondary"
                    className="min-h-11 border-emerald-500/40 bg-slate-950 text-xs font-bold text-emerald-300 sm:min-h-10"
                    onClick={() => {
                      setEditRecipeId(null);
                      setIsCreateRecipeModalOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 text-emerald-400" />
                    New BOM
                  </Button>
                ) : null}
                {canExecuteBom ? (
                  <Button
                    variant="secondary"
                    className="min-h-11 border-amber-500/40 bg-amber-400/90 text-xs font-black text-slate-950 sm:min-h-10"
                    onClick={() => {
                      setProductionRecipeId(undefined);
                      setProductionOpen(true);
                    }}
                  >
                    <ChefHat className="h-4 w-4" />
                    Execute batch
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  className="min-h-11 text-xs font-bold sm:min-h-10 lg:hidden"
                  onClick={scrollToCatalog}
                >
                  <BookOpen className="h-4 w-4" />
                  Catalog
                </Button>
              </div>
            </div>
            {syncing ? (
              <p className="mt-2 text-[10px] text-slate-500">Syncing waste KPI…</p>
            ) : null}
          </header>

          <ProductionMobileSectionNav
            active={mobileSection}
            onChange={setMobileSection}
            belowParCount={bomSummary.belowPar}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-6 lg:mt-6 lg:grid-cols-12 lg:items-start">
          <div
            className={cn(
              'min-w-0 space-y-4 lg:col-span-8',
              mobileSection !== 'bom' && 'hidden lg:block'
            )}
          >
            <ProductionActiveBomPanel
              recipes={recipes}
              initialManufacturingCatalog={manufacturingCatalog}
              dense
              hideExecutiveSummary
              canEditRecipes={canEditBom}
              canExecuteBatch={canExecuteBom}
              onSummaryChange={setBomSummary}
              onExecuteProduction={() => {
                setProductionRecipeId(undefined);
                setProductionOpen(true);
              }}
              onPrintDeliLabel={(r) => setSelectedDeliRecipe(r)}
              onEditRecipe={(r) => {
                if (!canEditBom) return;
                setEditRecipeId(r.id);
                setIsCreateRecipeModalOpen(true);
              }}
              onBulkPrintDeliLabels={(items) => {
                if (items.length === 0) return;
                deliPrintQueueRef.current = items.slice(1);
                setSelectedDeliRecipe(items[0] ?? null);
              }}
              onBrowseAll={scrollToCatalog}
            />

            <details
              ref={catalogRef}
              id="recipe-catalog"
              className="scroll-mt-28 rounded-2xl border border-slate-800/90 bg-slate-900/40 lg:scroll-mt-24"
            >
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-slate-200 marker:content-none [&::-webkit-details-marker]:hidden">
                Full recipe catalog ({savedRecipeCount})
              </summary>
              <div className="space-y-4 border-t border-slate-800/80 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-1.5">
                    {['ALL', 'Soup', 'Panzanella', 'Parfait', 'Bakery'].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                          selectedCategory === cat
                            ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                            : 'bg-slate-800/80 text-slate-400'
                        }`}
                      >
                        {cat === 'ALL' ? 'All' : cat}
                      </button>
                    ))}
                  </div>
                  <div className="relative w-full sm:w-56">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                    <Input
                      type="text"
                      placeholder="Search catalog…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 text-xs"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {filteredRecipes.map((recipe) => (
                    <RecipeFusionCard
                      key={recipe.id}
                      recipe={recipe}
                      onOpenDeliModal={(r) => setSelectedDeliRecipe(r)}
                      onExecuteBatch={
                        canExecuteBom
                          ? (r) => {
                              setProductionRecipeId(r.id);
                              setProductionOpen(true);
                            }
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            </details>
          </div>

          <aside
            className={cn(
              'min-w-0 space-y-4 lg:col-span-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-0.5',
              mobileSection === 'bom' ? 'hidden lg:block' : 'block'
            )}
          >
            <div
              className={cn(
                mobileSection === 'scrap' ? 'block' : 'hidden lg:block'
              )}
            >
              <VolumetricScrapForm
                compact
                storeConfig={scrapStoreConfig}
                totalBucketsLoggedToday={wasteKpi?.volumetricScrapBucketsCount ?? 0}
                onLogScrapBuckets={async (bucketsDelta, event) => {
                  await logVolumetricScrap(bucketsDelta, event);
                  setScrapToast(
                    `Volumetric scrap: +${bucketsDelta} bucket(s) · ${event.estimatedWeightKg} kg · $${event.estimatedScrapCostValue.toFixed(2)}`
                  );
                  setTimeout(() => setScrapToast(null), 4000);
                }}
                onResetBuckets={() => void refreshWasteKpi(true)}
              />
            </div>

            <div
              className={cn(
                mobileSection === 'floor' ? 'block' : 'hidden lg:block'
              )}
            >
              <LiveSubInventoryTransfers
                compact
                pullDays={pullSensitivityDays}
                initialLevels={initialTransferLevels}
                defaultTab="kitchen_prep"
                title="Live floor & prep transfers"
                description="Tap a SKU to transfer or log waste."
                showClerkFloorLink
                mobileFillViewport={mobileSection === 'floor'}
              />
            </div>
          </aside>
        </div>
      </PageMain>

      <InvoiceUploadModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        onInvoiceImported={(result: InvoiceOcrResult) => {
          stashInvoiceForReceiving(result);
          setIsInvoiceModalOpen(false);
          router.push('/receive');
        }}
      />

      <DeliLabelModal
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

      <ManualRecipeCreatorModal
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

      <RecipeProductionModal
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
