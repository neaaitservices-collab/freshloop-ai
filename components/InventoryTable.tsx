'use client';

import React, { useState } from 'react';
import { InventoryItem, InventoryStatusType } from '@/lib/types';
import {
  SUPPORTED_UNITS,
  STANDARD_RECEIVED_UNITS,
  STANDARD_RETAIL_UNITS,
  calculateCaseUnitValues,
  calculateRetailPriceByMargin
} from '@/lib/units';
import { DepartmentBadge } from './DepartmentBadge';
import { Sparkles, AlertCircle, Clock, ArrowRightLeft, Tag, Trash2, Search, CheckCircle2, Package, Edit3, Check, X, Percent, Calculator, Plus, Lock, FileText } from 'lucide-react';

interface InventoryTableProps {
  items: InventoryItem[];
  currentPullDays: number;
  onUpdateStatus: (id: string, newStatus: InventoryStatusType) => void;
  onTriggerFusionForItems: (itemIds: string[]) => void;
}

interface ItemUnitConfig {
  receivedUnit: string;
  packSize: number;
  subUnit: string; // Retail Unit
  yieldDivisor?: number;
  targetMargin?: number;
  retailUnitsPerCase?: number;
  unitCost?: number;
  suggestedPrice?: number;
}

export const InventoryTable: React.FC<InventoryTableProps> = ({
  items,
  currentPullDays,
  onUpdateStatus,
  onTriggerFusionForItems
}) => {
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  
  // Store Manager Target Gross Margin % (Default 35%)
  const [targetMarginPct, setTargetMarginPct] = useState<number>(35);

  // Dynamic unit overrides per item
  const [itemUnits, setItemUnits] = useState<Record<string, string>>({});

  // Dynamic Received & Retail Unit configuration per item
  const [itemCasePacks, setItemCasePacks] = useState<Record<string, ItemUnitConfig>>({});
  const [editingCaseItemId, setEditingCaseItemId] = useState<string | null>(null);

  // 3-Step Modal editing form state
  const [tempReceivedUnit, setTempReceivedUnit] = useState<string>('Case');
  const [customReceivedUnit, setCustomReceivedUnit] = useState<string>('');
  const [isCustomReceived, setIsCustomReceived] = useState<boolean>(false);

  const [tempPackSize, setTempPackSize] = useState<number>(24);

  const [tempSubUnit, setTempSubUnit] = useState<string>('quarts');
  const [customRetailUnit, setCustomRetailUnit] = useState<string>('');
  const [isCustomRetail, setIsCustomRetail] = useState<boolean>(false);

  // Section 2: Retail Yield Divisor
  const [tempYieldDivisor, setTempYieldDivisor] = useState<number>(1);

  // Section 3: Pricing Strategy Target Margin (35%, 40%, Custom)
  const [marginMode, setMarginMode] = useState<'35' | '40' | 'custom'>('35');
  const [tempCustomMargin, setTempCustomMargin] = useState<number>(35);

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.location.toLowerCase().includes(searchQuery.toLowerCase());

    const isPullTriggered = item.daysRemaining <= currentPullDays || item.status === 'PULL_RESCUE';

    let matchesStatus = true;
    if (selectedStatus === 'PULL_RESCUE') {
      matchesStatus = isPullTriggered && item.status !== 'DISCARDED';
    } else if (selectedStatus !== 'ALL') {
      matchesStatus = item.status === selectedStatus;
    }

    let matchesDept = true;
    if (selectedDepartment !== 'ALL') {
      matchesDept = item.department === selectedDepartment;
    }

    return matchesSearch && matchesStatus && matchesDept;
  });

  const toggleSelectItem = (id: string) => {
    if (selectedItemIds.includes(id)) {
      setSelectedItemIds(selectedItemIds.filter(i => i !== id));
    } else {
      setSelectedItemIds([...selectedItemIds, id]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedItemIds.length === filteredItems.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(filteredItems.map(i => i.id));
    }
  };

  const handleBulkFusion = () => {
    if (selectedItemIds.length > 0) {
      onTriggerFusionForItems(selectedItemIds);
    } else {
      const pullItemIds = filteredItems.filter(i => i.daysRemaining <= currentPullDays).map(i => i.id);
      onTriggerFusionForItems(pullItemIds);
    }
  };

  const handleUnitChange = (itemId: string, newUnit: string) => {
    setItemUnits(prev => ({ ...prev, [itemId]: newUnit }));
  };

  const startEditCasePack = (item: InventoryItem) => {
    const custom = itemCasePacks[item.id];
    const initialReceived = custom?.receivedUnit || (item.unit ? (item.unit.charAt(0).toUpperCase() + item.unit.slice(1)) : 'Case');
    const initialPack = custom ? custom.packSize : (item.casePackSize || 24);
    const initialRetail = custom ? custom.subUnit : (item.subUnit || 'quarts');
    const initialYieldDivisor = custom?.yieldDivisor || 1;
    const initialTargetMargin = custom?.targetMargin || targetMarginPct || 35;

    setEditingCaseItemId(item.id);
    setTempPackSize(initialPack);
    setTempYieldDivisor(initialYieldDivisor);

    if (initialTargetMargin === 35) {
      setMarginMode('35');
      setTempCustomMargin(35);
    } else if (initialTargetMargin === 40) {
      setMarginMode('40');
      setTempCustomMargin(40);
    } else {
      setMarginMode('custom');
      setTempCustomMargin(initialTargetMargin);
    }

    // Check if received/vendor unit is in standard list or custom
    if (STANDARD_RECEIVED_UNITS.includes(initialReceived)) {
      setTempReceivedUnit(initialReceived);
      setIsCustomReceived(false);
      setCustomReceivedUnit('');
    } else {
      setTempReceivedUnit('__CUSTOM__');
      setIsCustomReceived(true);
      setCustomReceivedUnit(initialReceived);
    }

    // Check if retail unit is in standard list or custom
    const isStandardRetail = STANDARD_RETAIL_UNITS.some(u => u.value === initialRetail);
    if (isStandardRetail) {
      setTempSubUnit(initialRetail);
      setIsCustomRetail(false);
      setCustomRetailUnit('');
    } else {
      setTempSubUnit('__CUSTOM__');
      setIsCustomRetail(true);
      setCustomRetailUnit(initialRetail);
    }
  };

  const saveEditCasePack = (itemId: string) => {
    const activeItem = items.find(i => i.id === itemId);
    const finalReceived = (isCustomReceived && customReceivedUnit.trim())
      ? customReceivedUnit.trim()
      : (tempReceivedUnit === '__CUSTOM__' ? 'Case' : tempReceivedUnit);

    const finalRetail = (isCustomRetail && customRetailUnit.trim())
      ? customRetailUnit.trim()
      : (tempSubUnit === '__CUSTOM__' ? 'ea' : tempSubUnit);

    const safePack = Math.max(0.01, tempPackSize || 1);
    const safeDivisor = Math.max(0.001, tempYieldDivisor || 1);

    // 1. Per-Case Yield: Retail Units Per Case = Pack Size / Yield Divisor
    const retailUnitsPerCase = Number((safePack / safeDivisor).toFixed(2));

    // 2. Unit Cost: Unit Cost = New Case Cost / Retail Units Per Case
    const caseCost = activeItem ? activeItem.receivedCost : 0;
    const unitCost = Number((caseCost / (retailUnitsPerCase || 1)).toFixed(2));

    // 3. Suggested Retail Price (SRP): SRP = Unit Cost / (1 - Margin Percentage)
    const activeMargin = marginMode === '35' ? 35 : marginMode === '40' ? 40 : Math.min(99, Math.max(1, tempCustomMargin || 35));
    const marginDivisor = (100 - activeMargin) / 100;
    const srp = Number((unitCost / (marginDivisor || 0.65)).toFixed(2));

    setItemCasePacks(prev => ({
      ...prev,
      [itemId]: {
        receivedUnit: finalReceived,
        packSize: safePack,
        subUnit: finalRetail,
        yieldDivisor: safeDivisor,
        targetMargin: activeMargin,
        retailUnitsPerCase: retailUnitsPerCase,
        unitCost: unitCost,
        suggestedPrice: srp
      }
    }));
    setEditingCaseItemId(null);
  };

  const getItemDisplayValues = (item: InventoryItem) => {
    const customPack = itemCasePacks[item.id];
    const receivedUnit = customPack?.receivedUnit || (item.unit ? (item.unit.charAt(0).toUpperCase() + item.unit.slice(1)) : 'Case');
    const casePackSize = customPack?.retailUnitsPerCase || customPack?.packSize || (item.casePackSize || 40);
    const subUnit = customPack ? customPack.subUnit : (item.subUnit || 'lbs'); // Retail Unit
    const targetUnit = itemUnits[item.id] || receivedUnit;

    const caseResult = calculateCaseUnitValues(
      item.quantity,
      item.receivedCost,
      casePackSize,
      subUnit,
      targetUnit,
      receivedUnit
    );

    const itemMargin = customPack?.targetMargin !== undefined ? customPack.targetMargin : targetMarginPct;
    const srpResult = calculateRetailPriceByMargin(
      customPack?.unitCost !== undefined ? customPack.unitCost : caseResult.displayUnitCost,
      itemMargin
    );

    const finalUnitCost = customPack?.unitCost !== undefined ? customPack.unitCost : caseResult.displayUnitCost;
    const finalSrp = customPack?.suggestedPrice !== undefined ? customPack.suggestedPrice : srpResult.retailPrice;

    return {
      ...caseResult,
      displayUnitCost: finalUnitCost,
      receivedUnit,
      srp: finalSrp,
      divisor: srpResult.divisor,
      marginFormula: `$${finalUnitCost.toFixed(2)} / ${srpResult.divisor.toFixed(2)} = $${finalSrp.toFixed(2)}`,
      casePackSize,
      subUnit
    };
  };

  const getStatusBadge = (status: InventoryStatusType, daysRemaining: number) => {
    const isTriggered = daysRemaining <= currentPullDays;

    if (status === 'DISCARDED') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
          Discarded
        </span>
      );
    }
    if (status === 'MARKDOWN') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-500/40">
          <Tag className="w-3 h-3" /> Markdown 30%
        </span>
      );
    }
    if (isTriggered || status === 'PULL_RESCUE') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-950/90 text-amber-300 border border-amber-500/50 animate-pulse">
          <AlertCircle className="w-3 h-3 text-amber-400" /> Pull Rescue
        </span>
      );
    }
    if (status === 'WARNING') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-yellow-950/70 text-yellow-300 border border-yellow-500/40">
          <Clock className="w-3 h-3 text-yellow-400" /> Early Warning
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-950/70 text-emerald-300 border border-emerald-500/30">
        <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Fresh
      </span>
    );
  };

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-xl">
      {/* 3-STEP WORKFLOW: Configure Received & Retail Units Modal */}
      {editingCaseItemId && (() => {
        const activeEditingItem = items.find(i => i.id === editingCaseItemId);
        if (!activeEditingItem) return null;

        const activeCasesReceived = activeEditingItem.quantity; // New Inventory Count
        const activeCaseCost = activeEditingItem.receivedCost; // New Case Cost
        const safePack = Math.max(0.01, tempPackSize || 1);
        const safeDivisor = Math.max(0.001, tempYieldDivisor || 1);

        const modalFinalVendorUnit = (isCustomReceived && customReceivedUnit.trim())
          ? customReceivedUnit.trim()
          : (tempReceivedUnit === '__CUSTOM__' ? 'Case' : tempReceivedUnit);

        const modalFinalRetailUnit = (isCustomRetail && customRetailUnit.trim())
          ? customRetailUnit.trim()
          : (tempSubUnit === '__CUSTOM__' ? 'ea' : tempSubUnit);

        // 1. Per-Case Yield: Retail Units Per Case = Pack Size / Yield Divisor
        // (Example: A 50 lb Pack Size / 5 lb Yield Divisor = 10 Retail Units per case)
        const modalRetailUnitsPerCase = Number((safePack / safeDivisor).toFixed(2));

        // 2. Unit Cost: Unit Cost = New Case Cost / Retail Units Per Case
        const modalUnitCost = Number((activeCaseCost / (modalRetailUnitsPerCase || 1)).toFixed(2));

        // 3. Suggested Retail Price (SRP): SRP = Unit Cost / (1 - Margin Percentage) (e.g., Unit Cost / 0.65 for a 35% margin)
        const modalActiveMargin = marginMode === '35' ? 35 : marginMode === '40' ? 40 : Math.min(99, Math.max(1, tempCustomMargin || 35));
        const modalMarginDivisor = (100 - modalActiveMargin) / 100;
        const modalSuggestedRetailPrice = Number((modalUnitCost / (modalMarginDivisor || 0.65)).toFixed(2));

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
            <div className="bg-zinc-950 border border-zinc-800 p-4 sm:p-6 rounded-3xl max-w-lg w-full space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto ring-1 ring-white/10">
              
              {/* Modal Header */}
              <div className="flex items-start justify-between border-b border-zinc-800/80 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Receiving_logs &bull; 3-Step Setup
                    </span>
                  </div>
                  <h3 className="text-base font-black text-white mt-1 flex items-center gap-2">
                    <Package className="w-4 h-4 text-emerald-400" /> Configure Received &amp; Retail Units
                  </h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Flow logically from vendor receiving to yield breakdown and pricing strategy.
                  </p>
                </div>
                <button
                  onClick={() => setEditingCaseItemId(null)}
                  className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* SECTION 1: Vendor Receiving (Auto-Filled & Locked) */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-black flex items-center justify-center border border-emerald-500/40">
                      1
                    </span>
                    <h4 className="text-xs font-black text-white uppercase tracking-wider">
                      Section 1: Vendor Receiving
                    </h4>
                  </div>
                  <span className="text-[10px] text-zinc-400 font-semibold flex items-center gap-1 bg-zinc-950 px-2 py-0.5 rounded-md border border-zinc-800">
                    <Lock className="w-2.5 h-2.5 text-zinc-500" /> Auto-Filled &amp; Locked
                  </span>
                </div>

                {/* Item Name: Clear Header */}
                <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800/80 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">
                      Select Item (Item Name)
                    </span>
                    <h5 className="text-sm font-black text-white truncate">
                      {activeEditingItem.name}
                    </h5>
                    {activeEditingItem.supplier && (
                      <span className="text-[10px] text-zinc-400">
                        Supplier: <strong className="text-zinc-300">{activeEditingItem.supplier}</strong>
                      </span>
                    )}
                  </div>
                  <DepartmentBadge department={activeEditingItem.department} size="sm" />
                </div>

                {/* Auto-populated Read-only Grid: Cases Received & Case Cost */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Cases Received */}
                  <div className="bg-zinc-950/90 p-2.5 rounded-xl border border-zinc-800/80">
                    <div className="flex items-center justify-between text-zinc-400 text-[10px] mb-0.5">
                      <span className="font-bold uppercase tracking-wider">Cases Received</span>
                      <Lock className="w-2.5 h-2.5 text-zinc-600" />
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-black text-emerald-300">
                        {activeEditingItem.quantity}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-medium">cases (New Count)</span>
                    </div>
                  </div>

                  {/* Case Cost */}
                  <div className="bg-zinc-950/90 p-2.5 rounded-xl border border-zinc-800/80">
                    <div className="flex items-center justify-between text-zinc-400 text-[10px] mb-0.5">
                      <span className="font-bold uppercase tracking-wider">Case Cost</span>
                      <Lock className="w-2.5 h-2.5 text-zinc-600" />
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-black text-white">
                        ${activeEditingItem.receivedCost.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-medium">/ case (New Cost)</span>
                    </div>
                  </div>
                </div>

                {/* Vendor Receiving Inputs: Pack Size & Vendor Unit */}
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  {/* Pack Size */}
                  <div>
                    <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                      Pack Size
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      value={tempPackSize}
                      onChange={(e) => setTempPackSize(parseFloat(e.target.value) || 1)}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-emerald-500"
                      placeholder="e.g. 24, 40"
                    />
                  </div>

                  {/* Vendor Unit */}
                  <div>
                    <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                      Vendor Unit
                    </label>
                    <select
                      value={tempReceivedUnit}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTempReceivedUnit(val);
                        if (val === '__CUSTOM__') {
                          setIsCustomReceived(true);
                        } else {
                          setIsCustomReceived(false);
                          setCustomReceivedUnit('');
                        }
                      }}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      {STANDARD_RECEIVED_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                      <option value="__CUSTOM__">+ Add Custom Vendor Unit...</option>
                    </select>
                  </div>
                </div>

                {isCustomReceived && (
                  <input
                    type="text"
                    value={customReceivedUnit}
                    onChange={(e) => setCustomReceivedUnit(e.target.value)}
                    placeholder="Type custom vendor unit (e.g. 50lb Sack, Hamper, Bushel, Tote)"
                    className="w-full bg-zinc-950 border border-emerald-500/60 rounded-xl px-3 py-2 text-xs text-emerald-300 font-bold focus:outline-none focus:border-emerald-400"
                    autoFocus
                  />
                )}
              </div>

              {/* SECTION 2: Retail Breakdown (Yield) */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-400 text-xs font-black flex items-center justify-center border border-teal-500/40">
                    2
                  </span>
                  <h4 className="text-xs font-black text-white uppercase tracking-wider">
                    Section 2: Retail Breakdown (Yield)
                  </h4>
                </div>

                <div className="space-y-2.5">
                  {/* Retail Sale Unit */}
                  <div>
                    <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                      Retail Sale Unit
                    </label>
                    <select
                      value={tempSubUnit}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTempSubUnit(val);
                        if (val === '__CUSTOM__') {
                          setIsCustomRetail(true);
                        } else {
                          setIsCustomRetail(false);
                          setCustomRetailUnit('');
                        }
                      }}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-emerald-300 font-bold focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      {STANDARD_RETAIL_UNITS.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                      <option value="__CUSTOM__">+ Add Custom Retail Unit...</option>
                    </select>

                    {isCustomRetail && (
                      <input
                        type="text"
                        value={customRetailUnit}
                        onChange={(e) => setCustomRetailUnit(e.target.value)}
                        placeholder="Type custom retail unit (e.g. stalk, head, clamshell, tub)"
                        className="mt-2 w-full bg-zinc-950 border border-emerald-500/60 rounded-xl px-3 py-2 text-xs text-emerald-300 font-bold focus:outline-none focus:border-emerald-400"
                        autoFocus
                      />
                    )}
                  </div>

                  {/* Yield Divisor & Math Breakdown */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-zinc-200 flex items-center gap-1.5">
                        <span>Yield Divisor</span>
                        <span className="text-[10px] text-zinc-400 font-normal">
                          (Portion size per retail sale unit)
                        </span>
                      </label>
                      <span className="text-[10px] text-zinc-500 font-mono">Default = 1</span>
                    </div>

                    <div className="relative">
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        value={tempYieldDivisor}
                        onChange={(e) => setTempYieldDivisor(parseFloat(e.target.value) || 1)}
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-emerald-500"
                        placeholder="e.g. 1 (or 5 for 5 lb bag)"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 font-semibold pointer-events-none">
                        {modalFinalVendorUnit} per {modalFinalRetailUnit}
                      </span>
                    </div>

                    <p className="text-[10px] text-zinc-400 mt-1">
                      e.g., A {safePack} {modalFinalVendorUnit} Pack Size / {safeDivisor} {modalFinalVendorUnit} Yield Divisor = <strong className="text-teal-300">{modalRetailUnitsPerCase} {modalFinalRetailUnit}</strong> per case.
                    </p>

                    {/* Step-by-Step Yield Breakdown Box */}
                    <div className="mt-2.5 p-2.5 bg-zinc-950 rounded-xl border border-teal-500/30 text-[11px] space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 font-medium">
                          Units per Case (Pack Size &divide; Yield Divisor):
                        </span>
                        <span className="font-mono text-zinc-300">
                          {safePack} &divide; {safeDivisor} = <strong className="text-teal-400 font-bold">{modalRetailUnitsPerCase} {modalFinalRetailUnit}/case</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Pricing Strategy */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-black flex items-center justify-center border border-amber-500/40">
                    3
                  </span>
                  <h4 className="text-xs font-black text-white uppercase tracking-wider">
                    Section 3: Pricing Strategy
                  </h4>
                </div>

                {/* Unit Cost Read-only Auto-calculated Field */}
                <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      Unit Cost (New Case Cost &divide; Retail Units Per Case)
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      ${activeCaseCost.toFixed(2)} &divide; {modalRetailUnitsPerCase} {modalFinalRetailUnit}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black text-white">
                      ${modalUnitCost.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-zinc-400 block">per {modalFinalRetailUnit}</span>
                  </div>
                </div>

                {/* Target Margin Segmented Control / Toggle Buttons */}
                <div>
                  <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                    Target Margin Percentage
                  </label>
                  <div className="grid grid-cols-3 gap-2 p-1 bg-zinc-950 rounded-xl border border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setMarginMode('35')}
                      className={`py-1.5 text-xs font-black rounded-lg transition-all ${
                        marginMode === '35'
                          ? 'bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      35%
                    </button>
                    <button
                      type="button"
                      onClick={() => setMarginMode('40')}
                      className={`py-1.5 text-xs font-black rounded-lg transition-all ${
                        marginMode === '40'
                          ? 'bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      40%
                    </button>
                    <button
                      type="button"
                      onClick={() => setMarginMode('custom')}
                      className={`py-1.5 text-xs font-black rounded-lg transition-all ${
                        marginMode === 'custom'
                          ? 'bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Custom
                    </button>
                  </div>

                  {marginMode === 'custom' && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="95"
                        value={tempCustomMargin}
                        onChange={(e) => setTempCustomMargin(parseFloat(e.target.value) || 35)}
                        className="w-full bg-zinc-950 border border-emerald-500/60 rounded-xl px-3 py-1.5 text-xs text-emerald-300 font-bold focus:outline-none focus:border-emerald-400"
                        placeholder="Enter custom margin % (e.g. 30, 45, 50)"
                        autoFocus
                      />
                      <span className="text-xs text-zinc-400 font-bold">%</span>
                    </div>
                  )}
                </div>

                {/* Suggested Retail Price Prominently Displayed */}
                <div className="p-3 bg-gradient-to-r from-emerald-950/60 to-teal-950/60 border border-emerald-500/40 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 block">
                      Suggested Retail Price: SRP = Unit Cost &divide; (1 - Margin %)
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      ${modalUnitCost.toFixed(2)} &divide; {modalMarginDivisor.toFixed(2)} ({modalActiveMargin}% Margin)
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-emerald-300">
                      ${modalSuggestedRetailPrice.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-zinc-400 block">per {modalFinalRetailUnit}</span>
                  </div>
                </div>
              </div>

              {/* CONFIGURED PACK SUMMARY (THE OUTPUT RECEIPT) */}
              <div className="p-3.5 bg-zinc-950 rounded-2xl border-2 border-emerald-500/60 shadow-xl space-y-2">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-emerald-400" /> Configured Pack Summary
                  </span>
                  <span className="text-[10px] text-zinc-500 uppercase font-mono">Receipt Confirmation</span>
                </div>

                <div className="space-y-1.5 text-xs">
                  {/* Yield */}
                  <div className="text-zinc-200">
                    <strong className="text-zinc-400">Yield:</strong>{' '}
                    <span className="font-extrabold text-white">
                      1 Case = {modalRetailUnitsPerCase} {modalFinalRetailUnit}
                    </span>
                  </div>

                  {/* Costs */}
                  <div className="text-zinc-200 font-mono text-[11px]">
                    <strong className="text-zinc-400 font-sans">Costs:</strong>{' '}
                    Case Cost: <strong className="text-white">${activeCaseCost.toFixed(2)}</strong>
                    <span className="text-zinc-600 mx-2">|</span>
                    Unit Cost: <strong className="text-emerald-400 font-bold">${modalUnitCost.toFixed(2)}</strong>
                  </div>

                  {/* Floor Pricing */}
                  <div className="text-zinc-200 pt-0.5">
                    <strong className="text-zinc-400">Floor Pricing:</strong>{' '}
                    To hit <strong className="text-emerald-400">{modalActiveMargin}%</strong>, price at{' '}
                    <strong className="text-emerald-300 font-black text-sm">${modalSuggestedRetailPrice.toFixed(2)}</strong>
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingCaseItemId(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => saveEditCasePack(editingCaseItemId)}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-black rounded-xl flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                >
                  <Check className="w-3.5 h-3.5" /> Save &amp; Apply Pricing
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Header & Controls Bar */}
      <div className="p-4 sm:p-5 border-b border-zinc-800/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              Fresh Inventory & Yield Triggers
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                {filteredItems.length}
              </span>
            </h2>
            <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5">
              Wholesale Case Lot tracking with variable Gross Margin formula pricing (<code className="text-emerald-400 font-mono">UnitCost / Divisor</code>).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkFusion}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
            >
              <Sparkles className="w-4 h-4 fill-zinc-950" />
              <span>
                {selectedItemIds.length > 0
                  ? `Fuse ${selectedItemIds.length} Selected`
                  : 'Fuse Short-Dated Items'}
              </span>
            </button>
          </div>
        </div>

        {/* Filter & Gross Margin Formula Controls */}
        <div className="flex flex-col gap-3 pt-1">
          {/* Status Tabs & Target Margin Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
              {[
                { id: 'ALL', label: 'All Items' },
                { id: 'PULL_RESCUE', label: `Pull (≤${currentPullDays}d)` },
                { id: 'FRESH', label: 'Fresh' },
                { id: 'MARKDOWN', label: 'Markdown' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedStatus(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold whitespace-nowrap transition-all ${
                    selectedStatus === tab.id
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Target Gross Margin Formula Selector */}
            <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs">
              <Calculator className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-zinc-400 font-semibold text-[11px] whitespace-nowrap">Target Margin:</span>
              <select
                value={targetMarginPct}
                onChange={(e) => setTargetMarginPct(parseInt(e.target.value))}
                className="bg-transparent text-emerald-300 font-bold text-xs focus:outline-none cursor-pointer"
              >
                <option value={30} className="bg-zinc-900 text-white">30% Margin (/0.70)</option>
                <option value={35} className="bg-zinc-900 text-white">35% Margin (/0.65)</option>
                <option value={40} className="bg-zinc-900 text-white">40% Margin (/0.60)</option>
                <option value={45} className="bg-zinc-900 text-white">45% Margin (/0.55)</option>
                <option value={50} className="bg-zinc-900 text-white">50% Margin (/0.50)</option>
              </select>
            </div>
          </div>

          {/* Department Filter & Search Input */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-medium text-zinc-300 focus:outline-none focus:border-emerald-500/50"
            >
              <option value="ALL">All Departments (Produce, Dairy, Bakery, Pantry)</option>
              <option value="PRODUCE">Produce</option>
              <option value="DAIRY">Dairy</option>
              <option value="BAKERY">Bakery</option>
              <option value="PANTRY">Pantry</option>
            </select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search item or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE CARD LIST VIEW (< 768px / 375px screens) */}
      <div className="block md:hidden divide-y divide-zinc-800/60">
        {filteredItems.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-xs">
            No inventory items match the selected filter criteria.
          </div>
        ) : (
          filteredItems.map((item) => {
            const isSelected = selectedItemIds.includes(item.id);
            const isPullTriggered = item.daysRemaining <= currentPullDays || item.status === 'PULL_RESCUE';
            const {
              displayQuantity,
              displayUnitCost,
              displayUnit,
              totalCost,
              totalSubUnits,
              packDescription,
              divisionFormula,
              srp,
              marginFormula,
              subUnit,
              receivedUnit
            } = getItemDisplayValues(item);

            return (
              <div
                key={item.id}
                className={`p-4 space-y-3 transition-colors ${
                  isPullTriggered ? 'bg-amber-950/20' : 'bg-zinc-950/30'
                } ${isSelected ? 'bg-emerald-950/30' : ''}`}
              >
                {/* Header Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectItem(item.id)}
                      className="mt-1 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/40"
                    />
                    <div>
                      <h3 className="font-bold text-white text-sm leading-snug">{item.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <DepartmentBadge department={item.department} size="sm" />
                      </div>
                    </div>
                  </div>

                  <div>{getStatusBadge(item.status, item.daysRemaining)}</div>
                </div>

                {/* Dedicated Received & Retail Units / Pack Ratio Box */}
                <div className="flex items-center justify-between p-2.5 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-xs">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-300 truncate">
                      <Package className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">{packDescription}</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 flex items-center gap-1.5">
                      <span>Rec&apos;d: <strong className="text-zinc-200">{receivedUnit}</strong></span>
                      <span>&bull;</span>
                      <span>Retail: <strong className="text-emerald-400">{subUnit}</strong></span>
                    </div>
                  </div>
                  <button
                    onClick={() => startEditCasePack(item)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-900/60 border border-emerald-500/40 text-[11px] text-emerald-300 font-semibold hover:bg-emerald-800 hover:text-white shrink-0 ml-2 shadow-sm active:scale-95 transition-all"
                  >
                    <Edit3 className="w-3 h-3 text-emerald-400" /> Edit Unit
                  </button>
                </div>

                {/* Mobile Inventory Pricing & Stock Box - Optimized for 375px */}
                <div className="p-2.5 sm:p-3 rounded-xl bg-zinc-900 border border-zinc-800/80 text-xs space-y-2">
                  {/* Stock Volume & Lot Cost */}
                  <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
                    <div>
                      <span className="text-[10px] text-zinc-500 font-semibold block">Stock on Floor</span>
                      <span className="font-extrabold text-white text-xs sm:text-sm">
                        {displayQuantity} {displayUnit} <span className="text-[10px] sm:text-xs font-normal text-zinc-400">({totalSubUnits} {subUnit})</span>
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-zinc-500 font-semibold block">Total Lot Cost</span>
                      <span className="font-extrabold text-emerald-400 text-xs sm:text-sm">
                        ${totalCost.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Unit Selector & Unit Cost */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-zinc-400 font-medium">Unit:</span>
                      <select
                        value={displayUnit}
                        onChange={(e) => handleUnitChange(item.id, e.target.value)}
                        className="bg-zinc-950 border border-zinc-700 text-emerald-300 font-bold rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        {SUPPORTED_UNITS.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.value === 'cases' ? 'cases (Case Lot)' : u.value}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-zinc-500 block">Cost / {displayUnit}</span>
                      <span className="font-bold text-zinc-200 text-xs">
                        ${displayUnitCost.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Target Retail Price & Variable Margin Formula */}
                  <div className="p-2 rounded-lg bg-zinc-950/70 border border-emerald-950/60 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-emerald-400 font-bold block">
                        SRP ({targetMarginPct}% Target Margin)
                      </span>
                      <span className="text-[9px] text-zinc-400 font-mono block">
                        {marginFormula}
                      </span>
                    </div>
                    <span className="text-sm font-black text-emerald-300 ml-2 shrink-0">
                      ${srp.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Progress Bar & Shelf Life */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-semibold">
                    <span className={item.daysRemaining <= 2 ? 'text-amber-400 font-bold' : 'text-zinc-400'}>
                      {item.daysRemaining} days left (Exp: {item.expirationDate})
                    </span>
                    <span className="text-zinc-500">{item.condition}</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        item.daysRemaining <= 2
                          ? 'bg-amber-400'
                          : item.daysRemaining <= 4
                          ? 'bg-yellow-400'
                          : 'bg-emerald-400'
                      }`}
                      style={{ width: `${Math.min(100, (item.daysRemaining / 7) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Quick Touch Action Buttons - 44px min tap targets */}
                <div className="flex items-center justify-between gap-1.5 sm:gap-2 pt-1">
                  <button
                    onClick={() => onUpdateStatus(item.id, 'PULL_RESCUE')}
                    className="flex-1 py-2.5 px-2 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 min-h-[44px]"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Kitchen Rescue</span>
                  </button>

                  <button
                    onClick={() => onUpdateStatus(item.id, 'MARKDOWN')}
                    className="flex-1 py-2.5 px-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-300 text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 min-h-[44px]"
                  >
                    <Tag className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Markdown 30%</span>
                  </button>

                  <button
                    onClick={() => onUpdateStatus(item.id, 'DISCARDED')}
                    className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-zinc-200 active:scale-95 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
                    title="Mark Discarded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* DESKTOP TABLE VIEW (≥ 768px screens) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-950/60 text-zinc-400 font-semibold border-b border-zinc-800/80">
            <tr>
              <th className="py-3 px-4 w-10">
                <input
                  type="checkbox"
                  checked={selectedItemIds.length > 0 && selectedItemIds.length === filteredItems.length}
                  onChange={toggleSelectAll}
                  className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/40"
                />
              </th>
              <th className="py-3 px-4">Item & Department</th>
              <th className="py-3 px-4 text-emerald-400">
                <div className="flex flex-col">
                  <span>Received & Retail Units</span>
                  <span className="text-[10px] text-zinc-500 font-normal">Pack Size / Ratio</span>
                </div>
              </th>
              <th className="py-3 px-4">Wholesale Stock & Unit Price</th>
              <th className="py-3 px-4 text-teal-400">SRP ({targetMarginPct}% Gross Margin)</th>
              <th className="py-3 px-4">Days Left & Exp Date</th>
              <th className="py-3 px-4">Condition & Location</th>
              <th className="py-3 px-4">Yield Status</th>
              <th className="py-3 px-4 text-right">Kitchen & Markdown Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-800/60 text-zinc-300 font-medium">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-zinc-500">
                  No inventory items match the selected filter criteria.
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const isSelected = selectedItemIds.includes(item.id);
                const isPullTriggered = item.daysRemaining <= currentPullDays || item.status === 'PULL_RESCUE';
                const {
                  displayQuantity,
                  displayUnitCost,
                  displayUnit,
                  totalCost,
                  totalSubUnits,
                  packDescription,
                  divisionFormula,
                  srp,
                  divisor,
                  marginFormula,
                  subUnit,
                  receivedUnit
                } = getItemDisplayValues(item);

                return (
                  <tr
                    key={item.id}
                    className={`transition-colors hover:bg-zinc-800/40 ${
                      isPullTriggered ? 'bg-amber-950/20 hover:bg-amber-950/30' : ''
                    } ${isSelected ? 'bg-emerald-950/30' : ''}`}
                  >
                    <td className="py-3.5 px-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectItem(item.id)}
                        className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/40"
                      />
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-bold text-white text-sm">{item.name}</span>
                        <div className="flex items-center gap-2">
                          <DepartmentBadge department={item.department} size="sm" />
                          {item.batchCode && (
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {item.batchCode}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* DEDICATED COLUMN: Received & Retail Units (Pack Size) */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1.5">
                        <button
                          onClick={() => startEditCasePack(item)}
                          className="inline-flex items-center gap-1.5 text-xs text-emerald-300 font-bold bg-emerald-950/70 border border-emerald-500/40 px-2.5 py-1 rounded-xl hover:bg-emerald-900/80 transition-all hover:scale-105 shadow-sm group w-fit cursor-pointer"
                          title="Click to edit received unit, retail unit, or pack size"
                        >
                          <Package className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{packDescription}</span>
                          <Edit3 className="w-3 h-3 text-emerald-400 opacity-60 group-hover:opacity-100 ml-0.5" />
                        </button>
                        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                          <span>
                            Rec&apos;d: <strong className="text-zinc-200 font-semibold">{receivedUnit}</strong>
                          </span>
                          <span className="text-zinc-600">&bull;</span>
                          <span>
                            Retail: <strong className="text-emerald-400 font-semibold">{subUnit}</strong>
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white text-sm">
                            {displayQuantity}
                          </span>
                          <select
                            value={displayUnit}
                            onChange={(e) => handleUnitChange(item.id, e.target.value)}
                            className="bg-zinc-950 border border-zinc-700 text-emerald-300 font-bold rounded px-1.5 py-0.5 text-[11px] focus:outline-none focus:border-emerald-500"
                          >
                            {SUPPORTED_UNITS.map((u) => (
                              <option key={u.value} value={u.value}>
                                {u.value === 'cases' ? 'cases (Primary)' : u.value}
                              </option>
                            ))}
                          </select>
                        </div>
                        <span className="text-[11px] font-semibold text-zinc-200">
                          ${displayUnitCost.toFixed(2)} / {displayUnit}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          ({totalSubUnits} {subUnit} total &bull; ${totalCost.toFixed(2)} lot)
                        </span>
                      </div>
                    </td>

                    {/* DEDICATED COLUMN: SRP & Margin Formula (UnitCost / Divisor) */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-extrabold text-emerald-400 text-sm">
                          ${srp.toFixed(2)} / {displayUnit}
                        </span>
                        <span className="text-[10px] font-bold text-teal-300">
                          {targetMarginPct}% Gross Margin
                        </span>
                        <span className="text-[9px] text-zinc-400 font-mono">
                          Formula: ${displayUnitCost.toFixed(2)} / {divisor.toFixed(2)}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1 max-w-[120px]">
                        <div className="flex justify-between text-[11px] font-semibold">
                          <span className={item.daysRemaining <= 2 ? 'text-amber-400 font-bold' : 'text-zinc-300'}>
                            {item.daysRemaining} days left
                          </span>
                        </div>
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              item.daysRemaining <= 2
                                ? 'bg-amber-400'
                                : item.daysRemaining <= 4
                                ? 'bg-yellow-400'
                                : 'bg-emerald-400'
                            }`}
                            style={{ width: `${Math.min(100, (item.daysRemaining / 7) * 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-zinc-500">Exp: {item.expirationDate}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex flex-col">
                        <span className="text-zinc-200 font-semibold">{item.condition}</span>
                        <span className="text-[11px] text-zinc-500">{item.location}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {getStatusBadge(item.status, item.daysRemaining)}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onUpdateStatus(item.id, 'PULL_RESCUE')}
                          title="Route to Kitchen Rescue"
                          className="p-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/30 text-emerald-300 transition-all hover:scale-105"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onUpdateStatus(item.id, 'MARKDOWN')}
                          title="Mark Down 30%"
                          className="p-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-500/30 text-rose-300 transition-all hover:scale-105"
                        >
                          <Tag className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onUpdateStatus(item.id, 'DISCARDED')}
                          title="Discard Item"
                          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 transition-all hover:text-zinc-200"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
