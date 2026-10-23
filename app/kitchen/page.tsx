'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { stashInvoiceForReceiving } from '@/lib/domains/receiving/receivingBridge';
import type { InvoiceOcrResult } from '@/lib/types';
import { AppShell } from '@/components/layout/AppShell';
import { PageIntro } from '@/components/layout/PageIntro';
import { RecipeFusionCard } from '@/components/features/recipes/RecipeFusionCard';
import { InvoiceUploadModal } from '@/components/features/invoices/InvoiceUploadModal';
import { VoiceRecorderModal } from '@/components/features/voice/VoiceRecorderModal';
import { DeliLabelModal } from '@/components/features/recipes/DeliLabelModal';
import { KitchenSubInventoryPanel } from '@/components/features/kitchen/KitchenSubInventoryPanel';
import { RecipeFusionResult } from '@/lib/types';
import { INITIAL_FUSION_RECIPES } from '@/lib/legacy/mockData';
import { Sparkles, UtensilsCrossed, Filter, Search, Loader2, Mic } from 'lucide-react';

export default function RecipesPage() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<RecipeFusionResult[]>(INITIAL_FUSION_RECIPES);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  // Modals state
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState<boolean>(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState<boolean>(false);
  const [selectedDeliRecipe, setSelectedDeliRecipe] = useState<RecipeFusionResult | null>(null);

  const fetchRecipes = async () => {
    try {
      const res = await fetch('/api/recipe-fusion');
      const json = await res.json();
      if (json.success && json.recipes) {
        setRecipes(json.recipes);
      }
    } catch (err) {
      console.warn('Failed to fetch recipes:', err);
    }
  };

  useEffect(() => {
    fetchRecipes();
  }, []);

  const handleGenerateNewRecipes = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/recipe-fusion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customCategory: selectedCategory })
      });
      const json = await res.json();
      if (json.success && json.data) {
        setRecipes((prev) => {
          const newItems = json.data.filter(
            (item: RecipeFusionResult) => !prev.some((p) => p.id === item.id)
          );
          return [...newItems, ...prev];
        });
      }
    } catch (err) {
      console.error('Failed to generate recipes:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredRecipes = recipes.filter((r) => {
    const matchesSearch = r.recipeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          r.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'ALL' || r.category.toLowerCase().includes(selectedCategory.toLowerCase());
    return matchesSearch && matchesCat;
  });

  return (
    <AppShell onVoice={() => setIsVoiceModalOpen(true)}>
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500 flex flex-col">
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-28 sm:pb-8 space-y-4 sm:space-y-6">
        <PageIntro
          step="Step 3 · Kitchen"
          title="Cook what the floor pulled"
          description="Turn short-dated ingredients into a prepared item, then print the deli label. Scrap buckets belong here too."
        />
        <KitchenSubInventoryPanel />
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-emerald-950/70 via-zinc-900 to-zinc-950 border border-emerald-900/40 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <UtensilsCrossed className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] sm:text-xs font-bold text-emerald-400 uppercase tracking-widest">Cross-Department Rescue Engine</span>
            </div>
            <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight">
              Prepared Foods Recipe Fusion Hub
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl leading-relaxed">
              Transform surplus produce, near-expiry dairy, and day-old bakery loaves into high-margin prepared soups, panzanellas, and parfait desserts.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={() => setIsVoiceModalOpen(true)}
              className="px-3 sm:px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-zinc-950 text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 active:scale-95 min-h-[44px]"
            >
              <Mic className="w-4 h-4 fill-zinc-950" />
              <span>Voice Transfer</span>
            </button>

            <button
              onClick={handleGenerateNewRecipes}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-zinc-950 shadow-lg shadow-emerald-500/25 transition-all min-h-[44px] active:scale-95"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-950" />
                  <span>Chef Cooking...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 fill-zinc-950" />
                  <span>Synthesize Recipes</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 sm:p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
            {['ALL', 'Soup', 'Panzanella', 'Parfait', 'Bakery'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {cat === 'ALL' ? 'All Rescue Recipes' : cat}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search recipes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
            />
          </div>
        </div>

        {/* Recipe Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {filteredRecipes.map((recipe) => (
            <RecipeFusionCard
              key={recipe.id}
              recipe={recipe}
              onOpenDeliModal={(r) => setSelectedDeliRecipe(r)}
            />
          ))}
        </div>
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
    </div>
    </AppShell>
  );
}
