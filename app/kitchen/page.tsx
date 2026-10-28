'use client';

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { stashInvoiceForReceiving } from '@/lib/domains/receiving/receivingBridge';
import type { InvoiceOcrResult } from '@/lib/types';
import { AppShell } from '@/components/layout/AppShell';
import { PageIntro } from '@/components/layout/PageIntro';
import { RecipeFusionCard } from '@/components/features/recipes/RecipeFusionCard';
import { InvoiceUploadModal } from '@/components/features/invoices/InvoiceUploadModal';
import { VoiceRecorderModal } from '@/components/features/voice/VoiceRecorderModal';
import { DeliLabelModal } from '@/components/features/recipes/DeliLabelModal';
import { KitchenSubInventoryPanel } from '@/components/features/kitchen/KitchenSubInventoryPanel';
import { KitchenIncomingRescueQueue } from '@/components/features/kitchen/KitchenIncomingRescueQueue';
import { RecipeFusionResult } from '@/lib/types';
import { INITIAL_FUSION_RECIPES } from '@/lib/legacy/mockData';
import {
  RecipeProductionModal,
  type ProductionBatchExecutedSummary,
} from '@/components/features/recipes/RecipeProductionModal';
import { ManualRecipeCreatorModal } from '@/components/features/recipes/ManualRecipeCreatorModal';
import { UtensilsCrossed, Search, Mic, ChefHat, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Toast } from '@/components/ui/Toast';

function KitchenPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusInbox = searchParams.get('inbox') === '1';
  const [recipes, setRecipes] = useState<RecipeFusionResult[]>(INITIAL_FUSION_RECIPES);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [prepProductIds, setPrepProductIds] = useState<string[]>([]);
  const [fusionError, setFusionError] = useState<string | null>(null);

  // Modals state
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState<boolean>(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState<boolean>(false);
  const [isCreateRecipeModalOpen, setIsCreateRecipeModalOpen] = useState<boolean>(false);
  const [selectedDeliRecipe, setSelectedDeliRecipe] = useState<RecipeFusionResult | null>(null);
  const [productionOpen, setProductionOpen] = useState(false);
  const [productionRecipeId, setProductionRecipeId] = useState<string | undefined>();
  const [batchToast, setBatchToast] = useState<string | null>(null);

  const fetchRecipes = async () => {
    try {
      const res = await fetch('/api/recipe-fusion');
      const json = await res.json();
      if (json.success && json.recipes) {
        setRecipes(json.recipes);
      }
    } catch {
      /* keep seeded / cached recipes */
    }
  };

  useEffect(() => {
    fetchRecipes();
  }, []);

  const onPrepIdsChange = useCallback((ids: string[]) => {
    setPrepProductIds(ids);
  }, []);

  const filteredRecipes = recipes.filter((r) => {
    const matchesSearch = r.recipeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          r.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'ALL' || r.category.toLowerCase().includes(selectedCategory.toLowerCase());
    return matchesSearch && matchesCat;
  });

  return (
    <AppShell onVoice={() => setIsVoiceModalOpen(true)}>
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 flex flex-col">
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-28 sm:pb-8 space-y-4 sm:space-y-6">
        <PageIntro
          step="Step 3 · Production"
          title="Production & Recipe Batching"
          description="Transform surplus produce and inventory into standard prepared deli goods. Execute BOM batches, consume raw ingredients on the ledger, and print deli labels."
        />
        <KitchenIncomingRescueQueue focusInbox={focusInbox} onPrepProductIdsChange={onPrepIdsChange} />
        {/* Header */}
        <Card className="border-emerald-900/40 bg-gradient-to-r from-emerald-950/70 via-slate-900/80 to-slate-950 shadow-2xl">
          <CardBody className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <UtensilsCrossed className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] sm:text-xs font-bold text-emerald-400 uppercase tracking-widest">Standard Bill of Materials (BOM)</span>
            </div>
            <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight">
              Prepared Goods & Production Hub
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Standardized recipes and bill of materials (BOM). Produce high-margin deli items, consume ingredients from production prep, and generate retail barcodes.
            </p>
          </div>

          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:items-center sm:gap-3">
            <Button
              variant="secondary"
              className="min-h-[44px] border-emerald-500/40 bg-slate-900 text-emerald-300 hover:bg-slate-800 text-xs font-bold shadow-md"
              onClick={() => setIsCreateRecipeModalOpen(true)}
            >
              <Plus className="h-4 w-4 text-emerald-400" />
              New Recipe (BOM)
            </Button>
            <Button
              variant="secondary"
              className="min-h-[44px] border-emerald-500/50 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 text-xs font-bold shadow-lg shadow-emerald-500/20"
              onClick={() => {
                setProductionRecipeId(undefined);
                setProductionOpen(true);
              }}
            >
              <ChefHat className="h-4 w-4 text-emerald-400" />
              Execute BOM Batch
            </Button>
            <Button
              variant="primary"
              className="min-h-[44px] border-teal-700 bg-teal-500 text-slate-950 hover:bg-teal-400 text-xs font-bold"
              onClick={() => setIsVoiceModalOpen(true)}
            >
              <Mic className="h-4 w-4 fill-slate-950" />
              Voice Transfer
            </Button>
          </div>
          </CardBody>
        </Card>

        {/* Filters */}
        <Card>
          <CardBody className="flex flex-col items-stretch justify-between gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
            {['ALL', 'Soup', 'Panzanella', 'Parfait', 'Bakery'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat === 'ALL' ? 'All Rescue Recipes' : cat}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <Input
              type="text"
              placeholder="Search recipes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs focus:border-emerald-500/50"
            />
          </div>
          </CardBody>
        </Card>

        {/* Recipe Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {filteredRecipes.map((recipe) => (
            <RecipeFusionCard
              key={recipe.id}
              recipe={recipe}
              onOpenDeliModal={(r) => setSelectedDeliRecipe(r)}
              onExecuteBatch={(r) => {
                setProductionRecipeId(r.id);
                setProductionOpen(true);
              }}
            />
          ))}
        </div>

        <details className="group rounded-2xl border border-slate-800/90 bg-slate-900/30">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-slate-300 marker:content-none [&::-webkit-details-marker]:hidden">
            Manage prep stock & transfers
            <span className="ml-2 text-xs font-normal text-slate-500">(ledger moves)</span>
          </summary>
          <div className="border-t border-slate-800/80 px-1 pb-2 pt-1">
            <KitchenSubInventoryPanel />
          </div>
        </details>
      </main>

      <InvoiceUploadModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        onInvoiceImported={(result: InvoiceOcrResult) => {
          stashInvoiceForReceiving(result);
          setIsInvoiceModalOpen(false);
          router.push('/receive');
        }}
      />

      <VoiceRecorderModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onVoiceLogged={fetchRecipes}
      />

      <DeliLabelModal
        isOpen={!!selectedDeliRecipe}
        onClose={() => setSelectedDeliRecipe(null)}
        recipe={selectedDeliRecipe}
      />

      <ManualRecipeCreatorModal
        isOpen={isCreateRecipeModalOpen}
        onClose={() => setIsCreateRecipeModalOpen(false)}
        onRecipeCreated={() => {
          setBatchToast('Recipe created successfully with Bill of Materials.');
          void fetchRecipes();
        }}
      />

      <RecipeProductionModal
        isOpen={productionOpen}
        initialRecipeId={productionRecipeId}
        onClose={() => setProductionOpen(false)}
        onBatchProduced={(summary: ProductionBatchExecutedSummary) => {
          setBatchToast(
            `Lote registrado: +${summary.batchOutputQty} × ${summary.outputProductName}`
          );
        }}
        onBatchFailed={(message) => setFusionError(message)}
      />

      <Toast
        message={batchToast}
        onDismiss={() => setBatchToast(null)}
        variant="success"
      />

      <Toast
        message={fusionError}
        onDismiss={() => setFusionError(null)}
        variant="destructive"
      />
    </div>
    </AppShell>
  );
}

export default function RecipesPage() {
  return (
    <Suspense fallback={null}>
      <KitchenPageContent />
    </Suspense>
  );
}
