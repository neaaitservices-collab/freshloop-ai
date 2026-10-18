'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { YieldWorkflowStepper } from '@/components/YieldWorkflowStepper';
import { StatsOverview } from '@/components/StatsOverview';
import { InventoryTable } from '@/components/InventoryTable';
import { InvoiceUploadModal } from '@/components/InvoiceUploadModal';
import { VoiceRecorderModal } from '@/components/VoiceRecorderModal';
import { DeliLabelModal } from '@/components/DeliLabelModal';
import { InventoryItem, RecipeFusionResult, InventoryStatusType } from '@/lib/types';
import { INITIAL_INVENTORY_ITEMS, INITIAL_FUSION_RECIPES } from '@/lib/mockData';
import { Sparkles, ArrowRight, RefreshCw, ChefHat, Printer, Mic } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>(INITIAL_INVENTORY_ITEMS);
  const [recipes, setRecipes] = useState<RecipeFusionResult[]>(INITIAL_FUSION_RECIPES);
  const [currentPullDays, setCurrentPullDays] = useState<number>(3); // Default 3-day human pull slider
  const [loading, setLoading] = useState<boolean>(false);
  const [fusionLoading, setFusionLoading] = useState<boolean>(false);

  // Modals state
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState<boolean>(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState<boolean>(false);
  const [selectedDeliRecipe, setSelectedDeliRecipe] = useState<RecipeFusionResult | null>(null);

  // Fetch live inventory
  const fetchInventory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory?pullDays=${currentPullDays}`);
      const json = await res.json();
      if (json.success && json.items) {
        setItems(json.items);
      }
    } catch (err) {
      console.warn('Failed to fetch inventory from API, using local state:', err);
    } finally {
      setLoading(false);
    }
  };

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
    fetchInventory();
    fetchRecipes();
  }, [currentPullDays]);

  const handleUpdateStatus = async (id: string, newStatus: InventoryStatusType) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    );

    try {
      await fetch('/api/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, updates: { status: newStatus } })
      });
    } catch (err) {
      console.error('Failed to update status on server:', err);
    }
  };

  const handleTriggerRecipeFusion = async (selectedIds?: string[]) => {
    setFusionLoading(true);
    try {
      const res = await fetch('/api/recipe-fusion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: selectedIds })
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
      console.error('Recipe fusion trigger error:', err);
    } finally {
      setFusionLoading(false);
    }
  };

  const affectedCount = items.filter(
    (i) => i.daysRemaining <= currentPullDays || i.status === 'PULL_RESCUE'
  ).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500 selection:text-zinc-950 flex flex-col">
      {/* Navigation Bar */}
      <Navbar
        onOpenInvoiceModal={() => setIsInvoiceModalOpen(true)}
        onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
        onOpenRecipeModal={() => handleTriggerRecipeFusion()}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-24 sm:pb-8 space-y-4 sm:space-y-8">
        {/* Page Banner Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-emerald-950/60 via-zinc-900/80 to-zinc-950 border border-emerald-900/30 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] sm:text-xs font-bold text-emerald-400 uppercase tracking-widest">Live Floor Operations</span>
            </div>
            <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight">
              Store Manager Yield & Rescue Hub
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl leading-relaxed">
              Cross-matching Produce, Dairy, Bakery, and Pantry short-dated stock to eliminate shrinkage and boost prepared deli margins.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center sm:gap-3">
            <button
              onClick={() => setIsVoiceModalOpen(true)}
              className="px-3 sm:px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-zinc-950 text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 active:scale-95 min-h-[44px]"
            >
              <Mic className="w-4 h-4 fill-zinc-950" />
              <span>Voice Transfer</span>
            </button>
            <button
              onClick={() => setIsInvoiceModalOpen(true)}
              className="px-3 sm:px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 active:scale-95 min-h-[44px]"
            >
              <span>Scan Invoice OCR</span>
            </button>
          </div>
        </div>

        {/* 5-Stage Grocery Yield Lifecycle Stepper */}
        <YieldWorkflowStepper
          onOpenInvoiceModal={() => setIsInvoiceModalOpen(true)}
          onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
          affectedItemCount={affectedCount}
          recipeCount={recipes.length}
        />

        {/* Quick Cross-Page Rescue & Recipe Banners */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Link
            href="/rescue"
            className="group p-4 rounded-2xl bg-gradient-to-r from-amber-950/40 to-zinc-900/60 border border-amber-900/40 hover:border-amber-500/50 transition-all flex items-center justify-between shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 group-hover:scale-105 transition-transform">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">Short-Dated Pulls</span>
                <h3 className="text-sm font-extrabold text-white group-hover:text-amber-300 transition-colors">
                  {affectedCount} Items Flagged for Rescue &bull; Manage Floor Pulls
                </h3>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-amber-400 group-hover:translate-x-1 transition-all shrink-0" />
          </Link>

          <Link
            href="/recipes"
            className="group p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-zinc-900/60 border border-emerald-900/40 hover:border-emerald-500/50 transition-all flex items-center justify-between shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 group-hover:scale-105 transition-transform">
                <ChefHat className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">AI Recipe Fusion</span>
                <h3 className="text-sm font-extrabold text-white group-hover:text-emerald-300 transition-colors">
                  {recipes.length} Rescued Recipes Ready &bull; Print Deli Labels
                </h3>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all shrink-0" />
          </Link>
        </div>

        {/* Stats Metrics Cards */}
        <StatsOverview
          items={items}
          recipes={recipes}
          currentPullDays={currentPullDays}
        />

        {/* Fresh Inventory & Case Lot Pricing Table */}
        <InventoryTable
          items={items}
          currentPullDays={currentPullDays}
          onUpdateStatus={handleUpdateStatus}
          onTriggerFusionForItems={() => router.push('/recipes')}
        />
      </main>

      {/* AI Modals */}
      <InvoiceUploadModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        onInvoiceImported={fetchInventory}
      />

      <VoiceRecorderModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onVoiceLogged={fetchInventory}
      />

      <DeliLabelModal
        isOpen={!!selectedDeliRecipe}
        onClose={() => setSelectedDeliRecipe(null)}
        recipe={selectedDeliRecipe}
      />

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-6 text-center text-xs text-zinc-600">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 FreshLoop AI • Yield Management Platform for Independent Grocers</p>
          <div className="flex items-center gap-4 text-zinc-500">
            <span>Next.js 15 App Router</span>
            <span>•</span>
            <span>Gemini 3.8 Flash</span>
            <span>•</span>
            <span>Supabase / PostgreSQL</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
