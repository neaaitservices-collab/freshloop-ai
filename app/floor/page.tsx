'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { PageIntro } from '@/components/shell/PageIntro';
import { PullSliderControl } from '@/components/PullSliderControl';
import { InventoryList } from '@/components/InventoryList';
import { VoiceRecorderModal } from '@/components/VoiceRecorderModal';
import { InvoiceUploadModal } from '@/components/InvoiceUploadModal';
import { DepartmentType, InventoryItem, InventoryStatusType } from '@/lib/types';
import { INITIAL_INVENTORY_ITEMS } from '@/lib/mockData';
import { Sparkles, Mic, ArrowRight, Search } from 'lucide-react';

const SUB_UNIT: Record<string, string> = {
  KG: 'kg',
  LBS: 'lbs',
  LITER: 'L',
  ML: 'ml',
  UNIT: 'units',
  BUNCH: 'bunches',
  LOAF: 'loaves',
  TUB: 'tubs',
  CASE: 'cases',
};

const DEPARTMENTS: DepartmentType[] = ['PRODUCE', 'DAIRY', 'BAKERY', 'PANTRY'];

function pullsFromLedger(rows: Array<Record<string, unknown>>): InventoryItem[] {
  return rows
    .filter((row) => row.isFlaggedForPull === true && row.isManufactured !== true)
    .map((row) => {
      const pack = Number(row.casePackSize) || 1;
      const onHand = Number(row.retailFloorQty) || 0;
      const unitCost = Number(row.movingAvgCost) || Number(row.standardCost) || 0;
      const department = DEPARTMENTS.includes(row.department as DepartmentType)
        ? (row.department as DepartmentType)
        : 'PRODUCE';

      return {
        id: String(row.productId),
        name: String(row.name),
        department,
        quantity: Number((onHand / pack).toFixed(2)),
        unit: 'cases',
        casePackSize: pack,
        subUnit: SUB_UNIT[String(row.unitType)] || 'units',
        receivedCost: unitCost * pack,
        receivedDate: '',
        expirationDate: String(row.expirationDate || ''),
        daysRemaining: Number(row.daysRemaining) || 0,
        condition: 'Near Expiry',
        status: 'WARNING',
        pullThresholdDays: 3,
        location: 'Retail floor',
        supplier: String(row.supplier || ''),
      };
    });
}

export default function FloorRescuePage() {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>(INITIAL_INVENTORY_ITEMS);
  const [currentPullDays, setCurrentPullDays] = useState<number>(3);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const statusOverrides = useRef<Record<string, InventoryStatusType>>({});

  const withOverrides = (list: InventoryItem[]) =>
    list.map((item) =>
      statusOverrides.current[item.id]
        ? { ...item, status: statusOverrides.current[item.id] }
        : item
    );

  // Modals
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState<boolean>(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState<boolean>(false);

  // Fetch live inventory
  const fetchInventory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory?pullDays=${currentPullDays}`);
      const json = await res.json();
      if (json.success && json.items?.length) {
        setItems(withOverrides(json.items));
      } else if (json.success && json.liveLedger?.subInventoryRows?.length) {
        setItems(withOverrides(pullsFromLedger(json.liveLedger.subInventoryRows)));
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
    statusOverrides.current = { ...statusOverrides.current, [id]: newStatus };
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

  const handleSendToRecipeFusion = () => {
    router.push('/kitchen');
  };

  return (
    <AppShell onVoice={() => setIsVoiceModalOpen(true)}>
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-amber-500 selection:text-zinc-950 flex flex-col">
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-28 sm:pb-8 space-y-4 sm:space-y-6">
        <PageIntro
          step="Step 2 · Floor"
          title="Pull what will not sell in time"
          description="Choose a 2, 3, or 4 day window. Send short-dated cases to the kitchen, or mark them down before they become waste."
          action={
            <div className="flex items-center gap-2">
              <Link
                href="/operations"
                className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-xs font-bold text-zinc-300"
              >
                <ArrowRight className="h-4 w-4 rotate-180" />
                Ledger
              </Link>
              <button
                type="button"
                onClick={() => setIsVoiceModalOpen(true)}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-teal-500 px-3 text-xs font-bold text-zinc-950"
              >
                <Mic className="h-4 w-4" />
                Voice
              </button>
              <button
                type="button"
                onClick={handleSendToRecipeFusion}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-xs font-bold text-zinc-950"
              >
                <Sparkles className="h-4 w-4" />
                Recipes
              </button>
            </div>
          }
        />

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
                {loading
                  ? 'Refreshing the pull list…'
                  : `Items expiring in ${currentPullDays} days or fewer.`}
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

          <InventoryList items={filteredItems} onStatusChange={handleUpdateStatus} />
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
    </AppShell>
  );
}
