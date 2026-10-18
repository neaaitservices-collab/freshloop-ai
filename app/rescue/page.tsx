'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { PullSliderControl } from '@/components/PullSliderControl';
import { DepartmentBadge } from '@/components/DepartmentBadge';
import { VoiceRecorderModal } from '@/components/VoiceRecorderModal';
import { InvoiceUploadModal } from '@/components/InvoiceUploadModal';
import { DeliLabelModal } from '@/components/DeliLabelModal';
import { InventoryItem, InventoryStatusType, RecipeFusionResult } from '@/lib/types';
import { INITIAL_INVENTORY_ITEMS } from '@/lib/mockData';
import { SUPPORTED_UNITS, calculateCaseUnitValues, calculateRetailPriceByMargin } from '@/lib/units';
import {
  ShieldAlert,
  ArrowRightLeft,
  Tag,
  Trash2,
  Sparkles,
  Mic,
  ArrowRight,
  Package,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Search,
  DollarSign,
  TrendingUp
} from 'lucide-react';

export default function FloorRescuePage() {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>(INITIAL_INVENTORY_ITEMS);
  const [currentPullDays, setCurrentPullDays] = useState<number>(3);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Modals
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState<boolean>(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState<boolean>(false);

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

  useEffect(() => {
    fetchInventory();
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

  // Only short-dated items (<= pullDays) or already routed to rescue/markdown
  const flaggedItems = items.filter(
    (item) => item.daysRemaining <= currentPullDays || item.status === 'PULL_RESCUE' || item.status === 'MARKDOWN'
  );

  const filteredItems = flaggedItems.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = selectedDepartment === 'ALL' || item.department === selectedDepartment;
    return matchesSearch && matchesDept;
  });

  const totalValueAtRisk = flaggedItems.reduce((acc, i) => acc + (i.quantity * i.receivedCost), 0);
  const kitchenRescueCount = flaggedItems.filter((i) => i.status === 'PULL_RESCUE').length;
  const markdownCount = flaggedItems.filter((i) => i.status === 'MARKDOWN').length;

  const toggleSelectItem = (id: string) => {
    if (selectedItemIds.includes(id)) {
      setSelectedItemIds(selectedItemIds.filter((i) => i !== id));
    } else {
      setSelectedItemIds([...selectedItemIds, id]);
    }
  };

  const handleSendToRecipeFusion = () => {
    router.push('/recipes');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-amber-500 selection:text-zinc-950 flex flex-col">
      {/* Top Navigation */}
      <Navbar
        onOpenInvoiceModal={() => setIsInvoiceModalOpen(true)}
        onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
        onOpenRecipeModal={handleSendToRecipeFusion}
      />

      {/* Main Floor Rescue Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-24 sm:pb-8 space-y-4 sm:space-y-6">
        {/* Banner Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-amber-950/60 via-zinc-900/80 to-zinc-950 border border-amber-900/40 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[10px] sm:text-xs font-bold text-amber-400 uppercase tracking-widest">Floor Pull Operations</span>
            </div>
            <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <ShieldAlert className="w-6 h-6 sm:w-8 sm:h-8 text-amber-400 shrink-0" />
              Floor Rescue & Pull Management
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl leading-relaxed">
              Identify short-dated cases approaching rotation deadlines. Transfer to Prep Kitchen for AI Recipe Fusion or apply immediate 30% markdown to eliminate store shrinkage.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
            {/* Direct Voice Transfer Trigger */}
            <button
              onClick={() => setIsVoiceModalOpen(true)}
              className="px-3 sm:px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-zinc-950 text-xs font-bold transition-all shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 active:scale-95 min-h-[44px]"
            >
              <Mic className="w-4 h-4 fill-zinc-950" />
              <span>Voice Transfer</span>
            </button>

            {/* Link to AI Recipe Fusion */}
            <button
              onClick={handleSendToRecipeFusion}
              className="px-3 sm:px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 text-xs font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5 active:scale-95 min-h-[44px]"
            >
              <Sparkles className="w-4 h-4 fill-zinc-950" />
              <span>Go to Recipe Fusion</span>
            </button>
          </div>
        </div>

        {/* Rescue Key Metrics - 2x2 on mobile */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-3.5 sm:p-5 shadow-lg">
            <span className="text-[10px] sm:text-xs font-semibold text-zinc-400 block truncate">Total Value At Risk</span>
            <span className="text-lg sm:text-2xl font-extrabold text-amber-400 mt-1 block">
              ${totalValueAtRisk.toFixed(2)}
            </span>
            <span className="text-[10px] text-zinc-500 mt-0.5 block">{flaggedItems.length} short-dated items</span>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-3.5 sm:p-5 shadow-lg">
            <span className="text-[10px] sm:text-xs font-semibold text-zinc-400 block truncate">Routed to Kitchen</span>
            <span className="text-lg sm:text-2xl font-extrabold text-emerald-400 mt-1 block">
              {kitchenRescueCount} items
            </span>
            <span className="text-[10px] text-emerald-400/80 mt-0.5 block">Cross-matching recipes</span>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-3.5 sm:p-5 shadow-lg">
            <span className="text-[10px] sm:text-xs font-semibold text-zinc-400 block truncate">On Markdown Floor</span>
            <span className="text-lg sm:text-2xl font-extrabold text-rose-400 mt-1 block">
              {markdownCount} items
            </span>
            <span className="text-[10px] text-rose-400/80 mt-0.5 block">30% Floor Discount</span>
          </div>

          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-3.5 sm:p-5 shadow-lg">
            <span className="text-[10px] sm:text-xs font-semibold text-zinc-400 block truncate">Pull Sensitivity</span>
            <span className="text-lg sm:text-2xl font-extrabold text-teal-300 mt-1 block">
              ≤ {currentPullDays} Days
            </span>
            <span className="text-[10px] text-zinc-500 mt-0.5 block">Active Floor Window</span>
          </div>
        </div>

        {/* Pull Sensitivity Slider Section */}
        <PullSliderControl
          currentPullDays={currentPullDays}
          onPullDaysChange={setCurrentPullDays}
          affectedCount={flaggedItems.length}
        />

        {/* Filter & Action Queue */}
        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-3.5 sm:p-5 border-b border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Short-Dated Action Queue
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {filteredItems.length} Items Flagged
                </span>
              </h2>
              <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5">
                Items expiring in ≤ {currentPullDays} days require immediate store manager action.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-medium text-zinc-300 focus:outline-none focus:border-amber-500"
              >
                <option value="ALL">All Departments</option>
                <option value="PRODUCE">Produce</option>
                <option value="DAIRY">Dairy</option>
                <option value="BAKERY">Bakery</option>
                <option value="PANTRY">Pantry</option>
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search item..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-48 bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Cards List for Floor Pulls */}
          <div className="divide-y divide-zinc-800/60">
            {filteredItems.length === 0 ? (
              <div className="p-12 text-center text-zinc-500 text-xs space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="font-bold text-zinc-300">No items currently flagged for pull</p>
                <p className="text-zinc-500">All inventory items have more than {currentPullDays} days remaining shelf life.</p>
              </div>
            ) : (
              filteredItems.map((item) => {
                const casePack = item.casePackSize || 40;
                const subUnit = item.subUnit || 'lbs';
                const srpResult = calculateRetailPriceByMargin(item.receivedCost / casePack, 35);

                return (
                  <div
                    key={item.id}
                    className="p-3.5 sm:p-5 space-y-3 bg-zinc-950/40 hover:bg-zinc-900/50 transition-colors"
                  >
                    {/* Item Top Row */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white text-sm sm:text-base leading-snug">{item.name}</h3>
                          <DepartmentBadge department={item.department} size="sm" />
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-400">
                          <span>Location: <strong className="text-zinc-200">{item.location}</strong></span>
                          <span>•</span>
                          <span>Supplier: <strong className="text-zinc-200">{item.supplier}</strong></span>
                        </div>
                      </div>

                      {/* Expiration warning badge */}
                      <div className="flex flex-col items-end">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full ${
                          item.daysRemaining <= 2
                            ? 'bg-rose-950 text-rose-300 border border-rose-500/50 animate-pulse'
                            : 'bg-amber-950 text-amber-300 border border-amber-500/50'
                        }`}>
                          <Clock className="w-3 h-3" />
                          {item.daysRemaining}d Left
                        </span>
                        <span className="text-[10px] text-zinc-500 mt-0.5">Exp: {item.expirationDate}</span>
                      </div>
                    </div>

                    {/* Stock & Cost Breakdown */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 sm:p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs">
                      <div>
                        <span className="text-[10px] text-zinc-500 block">Stock on Hand</span>
                        <span className="font-bold text-white text-xs sm:text-sm">
                          {item.quantity} cases <span className="text-[10px] text-zinc-400">({item.quantity * casePack} {subUnit})</span>
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-zinc-500 block">Lot Cost</span>
                        <span className="font-bold text-emerald-400 text-xs sm:text-sm">
                          ${(item.quantity * item.receivedCost).toFixed(2)}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-zinc-500 block">Case Division</span>
                        <span className="font-semibold text-zinc-300 text-xs">
                          1 Case = {casePack} {subUnit}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-zinc-500 block">Current Status</span>
                        <span className="font-bold text-xs text-amber-300">
                          {item.status === 'PULL_RESCUE'
                            ? 'Routed to Kitchen'
                            : item.status === 'MARKDOWN'
                            ? '30% Markdown'
                            : 'Flagged for Pull'}
                        </span>
                      </div>
                    </div>

                    {/* Quick Touch Action Buttons - 44px min tap targets */}
                    <div className="flex items-center justify-between gap-1.5 sm:gap-2 pt-1">
                      <button
                        onClick={() => handleUpdateStatus(item.id, 'PULL_RESCUE')}
                        className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 min-h-[44px] ${
                          item.status === 'PULL_RESCUE'
                            ? 'bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20'
                            : 'bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300'
                        }`}
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{item.status === 'PULL_RESCUE' ? '✓ In Kitchen Rescue' : 'Send to Kitchen Rescue'}</span>
                      </button>

                      <button
                        onClick={() => handleUpdateStatus(item.id, 'MARKDOWN')}
                        className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 min-h-[44px] ${
                          item.status === 'MARKDOWN'
                            ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                            : 'bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-300'
                        }`}
                      >
                        <Tag className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{item.status === 'MARKDOWN' ? '✓ On Markdown' : 'Markdown 30%'}</span>
                      </button>

                      <button
                        onClick={() => handleUpdateStatus(item.id, 'DISCARDED')}
                        className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-zinc-200 active:scale-95 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                        title="Mark as Discarded / Waste"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* Modals */}
      <VoiceRecorderModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onVoiceLogged={fetchInventory}
      />

      <InvoiceUploadModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        onInvoiceImported={fetchInventory}
      />
    </div>
  );
}
