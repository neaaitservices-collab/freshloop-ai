'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { stashInvoiceForReceiving } from '@/lib/receivingBridge';
import type { InvoiceOcrResult } from '@/lib/types';
import { AppShell } from '@/components/shell/AppShell';
import { DepartmentBadge } from '@/components/DepartmentBadge';
import { InvoiceUploadModal } from '@/components/InvoiceUploadModal';
import { VoiceLoggerModal, ConfirmedVoiceCommitResult } from '@/components/VoiceLoggerModal';
import { RecipeProductionModal, ProductionBatchExecutedSummary } from '@/components/RecipeProductionModal';
import { VolumetricScrapForm } from '@/components/VolumetricScrapForm';
import { DeliLabelModal } from '@/components/DeliLabelModal';
import { InventoryItem, RecipeFusionResult, DepartmentType } from '@/lib/types';
import type { WasteKpiReport } from '@/lib/inventory';
import { OperationsLiveTransfers } from '@/components/operations/OperationsLiveTransfers';
import { INITIAL_INVENTORY_ITEMS, INITIAL_FUSION_RECIPES } from '@/lib/mockData';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Boxes,
  CheckCircle2,
  ChefHat,
  Clock,
  DollarSign,
  FileText,
  Filter,
  Flame,
  Layers,
  Mic,
  PackageCheck,
  Printer,
  RefreshCw,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Store,
  Trash2,
  TrendingDown,
  UtensilsCrossed,
} from 'lucide-react';

// ============================================================================
// Strict Types for Phase 4 Manager Command Center
// ============================================================================

type SubInventoryLocationTab = 'SPLIT_VIEW' | 'Retail_Floor' | 'Kitchen_Prep';

interface SubInventoryLedgerRow {
  productId: string;
  barcode: string;
  name: string;
  department: DepartmentType | 'DELI_KITCHEN';
  unitType: string;
  retailFloorQty: number;
  kitchenPrepQty: number;
  movingAvgCost: number;
  retailPrice: number;
  targetMarginPct: number;
  yieldPct: number;
  daysRemaining: number;
  expirationDate: string;
  supplier: string;
  isManufactured: boolean;
}

// ============================================================================
// Initial Ledger Seed Snapshot (Mirrors Phase 1 & 2 Ledger when DB is offline)
// ============================================================================

const DEFAULT_LEDGER_ROWS: SubInventoryLedgerRow[] = [
  {
    productId: 'prod-avocado-hass',
    barcode: '4225',
    name: 'Avocados Hass (Mexico)',
    department: 'PRODUCE',
    unitType: 'UNIT',
    retailFloorQty: 88, // 144 received - 36 rescued to kitchen - 20 sold
    kitchenPrepQty: 36, // 36 transferred via Rescue
    movingAvgCost: 1.81,
    retailPrice: 3.49,
    targetMarginPct: 48,
    yieldPct: 75,
    daysRemaining: 2,
    expirationDate: '2026-10-22',
    supplier: 'Tony Deodato & Sons',
    isManufactured: false,
  },
  {
    productId: 'prod-tomato-hothouse',
    barcode: '4799',
    name: 'Hot House Tomatoes (Ontario)',
    department: 'PRODUCE',
    unitType: 'LBS',
    retailFloorQty: 46, // 64 received - 15 rescued - 3 wasted
    kitchenPrepQty: 15, // 15 lbs in Kitchen_Prep for Panzanella
    movingAvgCost: 2.5,
    retailPrice: 4.49,
    targetMarginPct: 44,
    yieldPct: 95,
    daysRemaining: 3,
    expirationDate: '2026-10-23',
    supplier: 'Casteels Greenhouse',
    isManufactured: false,
  },
  {
    productId: 'prod-sourdough-boule',
    barcode: '8001039001',
    name: 'Artisanal Sourdough Boule',
    department: 'BAKERY',
    unitType: 'LOAF',
    retailFloorQty: 19, // 27 received - 8 rescued
    kitchenPrepQty: 8, // 8 loaves in Kitchen_Prep for Croutons/Panzanella
    movingAvgCost: 2.1,
    retailPrice: 4.99,
    targetMarginPct: 44,
    yieldPct: 100,
    daysRemaining: 2,
    expirationDate: '2026-10-22',
    supplier: 'Moores Artisan Bakery',
    isManufactured: false,
  },
  {
    productId: 'prod-apple-honeycrisp',
    barcode: '19906',
    name: 'Honey Crisp Apples',
    department: 'PRODUCE',
    unitType: 'LBS',
    retailFloorQty: 62, // 80 received - 18 sold
    kitchenPrepQty: 20, // Prepped for Spiced Apple Parfait
    movingAvgCost: 2.62,
    retailPrice: 4.49,
    targetMarginPct: 40,
    yieldPct: 92,
    daysRemaining: 4,
    expirationDate: '2026-10-24',
    supplier: 'Tony Deodato & Sons',
    isManufactured: false,
  },
  {
    productId: 'prod-heavy-cream',
    barcode: '068700100402',
    name: 'Whole Heavy Cream 40%',
    department: 'DAIRY',
    unitType: 'LITER',
    retailFloorQty: 10,
    kitchenPrepQty: 6,
    movingAvgCost: 3.8,
    retailPrice: 6.49,
    targetMarginPct: 38,
    yieldPct: 100,
    daysRemaining: 3,
    expirationDate: '2026-10-23',
    supplier: 'Golden State Dairy',
    isManufactured: false,
  },
  {
    productId: 'prod-greek-yogurt',
    barcode: '068700200911',
    name: 'Greek Whole Milk Yogurt (750g)',
    department: 'DAIRY',
    unitType: 'TUB',
    retailFloorQty: 16,
    kitchenPrepQty: 24,
    movingAvgCost: 2.2,
    retailPrice: 4.29,
    targetMarginPct: 40,
    yieldPct: 100,
    daysRemaining: 6,
    expirationDate: '2026-10-26',
    supplier: 'Golden State Dairy',
    isManufactured: false,
  },
  {
    productId: 'prod-tomato-cocktail',
    barcode: '011067950807',
    name: 'Cocktail Tomatoes',
    department: 'PRODUCE',
    unitType: 'LBS',
    retailFloorQty: 20,
    kitchenPrepQty: 4,
    movingAvgCost: 3.5,
    retailPrice: 5.99,
    targetMarginPct: 42,
    yieldPct: 98,
    daysRemaining: 3,
    expirationDate: '2026-10-23',
    supplier: 'Casteels Greenhouse',
    isManufactured: false,
  },
  {
    productId: 'prod-cilantro',
    barcode: '4889',
    name: 'Fresh Cilantro Bunch',
    department: 'PRODUCE',
    unitType: 'BUNCH',
    retailFloorQty: 18,
    kitchenPrepQty: 6,
    movingAvgCost: 1.38,
    retailPrice: 2.99,
    targetMarginPct: 54,
    yieldPct: 75,
    daysRemaining: 3,
    expirationDate: '2026-10-23',
    supplier: 'Tony Deodato & Sons',
    isManufactured: false,
  },
  {
    productId: 'prod-jalapeno',
    barcode: '4693',
    name: 'Jalapeno Peppers',
    department: 'PRODUCE',
    unitType: 'LBS',
    retailFloorQty: 16,
    kitchenPrepQty: 4,
    movingAvgCost: 1.9,
    retailPrice: 3.99,
    targetMarginPct: 53,
    yieldPct: 85,
    daysRemaining: 8,
    expirationDate: '2026-10-28',
    supplier: 'Tony Deodato & Sons',
    isManufactured: false,
  },
  {
    productId: 'prod-evoo-5l',
    barcode: '841001005000',
    name: 'Extra Virgin Olive Oil (Bulk Kitchen)',
    department: 'PANTRY',
    unitType: 'LITER',
    retailFloorQty: 0,
    kitchenPrepQty: 19.5,
    movingAvgCost: 5.7,
    retailPrice: 10.99,
    targetMarginPct: 45,
    yieldPct: 100,
    daysRemaining: 120,
    expirationDate: '2027-02-17',
    supplier: 'Mediterranean Imports',
    isManufactured: false,
  },
  {
    productId: 'prod-deli-panzanella',
    barcode: '290001000018',
    name: 'Roasted Tomato & Sourdough Panzanella (12 oz)',
    department: 'DELI_KITCHEN',
    unitType: 'TUB',
    retailFloorQty: 12,
    kitchenPrepQty: 20,
    movingAvgCost: 1.98,
    retailPrice: 8.99,
    targetMarginPct: 78,
    yieldPct: 100,
    daysRemaining: 3,
    expirationDate: '2026-10-23',
    supplier: 'FreshLoop Kitchen',
    isManufactured: true,
  },
  {
    productId: 'prod-deli-guacamole',
    barcode: '290001000032',
    name: 'Fresh Kitchen Rescue Guacamole Cup (6 oz)',
    department: 'DELI_KITCHEN',
    unitType: 'TUB',
    retailFloorQty: 15,
    kitchenPrepQty: 30,
    movingAvgCost: 1.82,
    retailPrice: 4.99,
    targetMarginPct: 64,
    yieldPct: 100,
    daysRemaining: 2,
    expirationDate: '2026-10-22',
    supplier: 'FreshLoop Kitchen',
    isManufactured: true,
  },
];

export default function OperationsCenter() {
  const router = useRouter();
  // Core state
  const [ledgerRows, setLedgerRows] =
    useState<SubInventoryLedgerRow[]>(DEFAULT_LEDGER_ROWS);
  const [recipes, setRecipes] = useState<RecipeFusionResult[]>(
    INITIAL_FUSION_RECIPES
  );
  const [pullSensitivityDays, setPullSensitivityDays] = useState<2 | 3 | 4>(3);
  const [activeLocationTab, setActiveLocationTab] =
    useState<SubInventoryLocationTab>('SPLIT_VIEW');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyShowFlaggedPulls, setOnlyShowFlaggedPulls] =
    useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [wasteKpiReport, setWasteKpiReport] = useState<WasteKpiReport | null>(null);

  // Modals state
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState<boolean>(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState<boolean>(false);
  const [isRecipeProductionModalOpen, setIsRecipeProductionModalOpen] =
    useState<boolean>(false);
  const [selectedDeliRecipe, setSelectedDeliRecipe] =
    useState<RecipeFusionResult | null>(null);
  const [transferToast, setTransferToast] = useState<string | null>(null);

  const wasteKpi = wasteKpiReport;
  const wastePctDisplay =
    wasteKpi?.wastePct === null || wasteKpi?.wastePct === undefined
      ? '—'
      : `${wasteKpi.wastePct.toFixed(2)}%`;
  const isWasteExceedingTarget = wasteKpi?.isExceedingTarget ?? false;

  // Fetch live ledger data from /api/inventory
  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory?pullDays=${pullSensitivityDays}`);
      const json = await res.json();

      if (json.success && json.liveLedger) {
        if (
          Array.isArray(json.liveLedger.subInventoryRows) &&
          json.liveLedger.subInventoryRows.length > 0
        ) {
          setLedgerRows(json.liveLedger.subInventoryRows);
        }
        if (json.liveLedger.wasteKpi) {
          setWasteKpiReport(json.liveLedger.wasteKpi as WasteKpiReport);
        }
      }
    } catch (err) {
      console.warn('Using local ledger snapshot:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pullSensitivityDays]);

  // Instant 1-Click Rescue Transfer: Retail_Floor -> Kitchen_Prep (Double-Entry)
  // Filtered rows & sub-inventory calculations
  const filteredRows = useMemo(() => {
    return ledgerRows.filter((row) => {
      if (departmentFilter !== 'ALL' && row.department !== departmentFilter) {
        return false;
      }
      if (
        searchQuery.trim() !== '' &&
        !row.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !row.barcode.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !row.supplier.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      if (onlyShowFlaggedPulls && row.daysRemaining > pullSensitivityDays) {
        return false;
      }
      return true;
    });
  }, [ledgerRows, departmentFilter, searchQuery, onlyShowFlaggedPulls, pullSensitivityDays]);

  const retailFloorRows = useMemo(
    () => filteredRows.filter((r) => r.retailFloorQty > 0),
    [filteredRows]
  );

  const kitchenPrepRows = useMemo(
    () => filteredRows.filter((r) => r.kitchenPrepQty > 0),
    [filteredRows]
  );

  // Summary metrics
  const flaggedRetailItems = useMemo(
    () =>
      ledgerRows.filter(
        (r) => r.retailFloorQty > 0 && r.daysRemaining <= pullSensitivityDays
      ),
    [ledgerRows, pullSensitivityDays]
  );

  const atRiskRetailValue = useMemo(
    () =>
      flaggedRetailItems.reduce(
        (sum, r) => sum + r.retailFloorQty * r.retailPrice,
        0
      ),
    [flaggedRetailItems]
  );

  const totalRetailFloorValue = useMemo(
    () =>
      ledgerRows.reduce(
        (sum, r) => sum + r.retailFloorQty * r.movingAvgCost,
        0
      ),
    [ledgerRows]
  );

  const totalKitchenPrepValue = useMemo(
    () =>
      ledgerRows.reduce(
        (sum, r) => sum + r.kitchenPrepQty * r.movingAvgCost,
        0
      ),
    [ledgerRows]
  );

  const pullSensitivityOptions: Array<{
    days: 2 | 3 | 4;
    title: string;
    subtitle: string;
    badge: string;
  }> = [
    {
      days: 2,
      title: '2 Días — Retiro Estricto',
      subtitle: 'Rotación ultra-fresca para bayas, panadería artesanal y lácteos críticos.',
      badge: 'Alta Prioridad',
    },
    {
      days: 3,
      title: '3 Días — Estándar Operativo',
      subtitle: 'Balance óptimo para enviar insumos a Kitchen_Prep antes de perder firmeza.',
      badge: 'Recomendado',
    },
    {
      days: 4,
      title: '4 Días — Alerta Temprana',
      subtitle: 'Sensibilidad preventiva para alto volumen de frutas climatéricas y paquetes POS.',
      badge: 'Preventivo',
    },
  ];

  return (
    <AppShell onVoice={() => setIsVoiceModalOpen(true)}>
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500 selection:text-zinc-950 flex flex-col">

      {/* Real-Time Ledger Transfer Toast */}
      {transferToast && (
        <div className="fixed bottom-20 sm:bottom-6 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-950/95 border border-emerald-400/50 text-emerald-200 shadow-2xl backdrop-blur-xl animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="text-xs">
            <p className="font-bold text-white">Ledger Transaction Recorded</p>
            <p className="text-emerald-300/90">{transferToast}</p>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 pb-28 sm:pb-12 space-y-6">
        {/* Header Bar */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900/90 via-zinc-900/60 to-zinc-950 border border-zinc-800/90 p-5 sm:p-7 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold uppercase tracking-wider">
                <Activity className="w-3.5 h-3.5 animate-pulse" />
                <span>Centro de Mando del Gerente • Ledger Inmutable Activo</span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white">
                FreshLoop AI{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">
                  Yield &amp; Sub-Inventory Control
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl">
                Monitoreo en tiempo real del Semáforo KPI de Merma, sensibilidad de retiro humano (2, 3 y 4 días) y balance de doble partida entre{' '}
                <code className="text-emerald-300 font-mono">Retail_Floor</code> y{' '}
                <code className="text-amber-300 font-mono">Kitchen_Prep</code>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/receive"
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-400 hover:bg-emerald-300 text-zinc-950 font-extrabold text-xs shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
              >
                <DollarSign className="w-4 h-4" />
                <span>Receiving prices</span>
              </Link>

              <button
                onClick={() => setIsVoiceModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-400 hover:from-teal-400 hover:to-emerald-300 text-zinc-950 font-extrabold text-xs shadow-lg shadow-teal-500/20 transition-all active:scale-95 cursor-pointer"
              >
                <Mic className="w-4 h-4 fill-zinc-950" />
                <span>Voice Logger (Confirm Loop)</span>
              </button>

              <button
                onClick={() => setIsRecipeProductionModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-300 hover:to-orange-300 text-zinc-950 font-extrabold text-xs shadow-lg shadow-amber-500/20 transition-all active:scale-95 cursor-pointer"
              >
                <ChefHat className="w-4 h-4" />
                <span>Producir Lote BOM (Varianza)</span>
              </button>

              <button
                onClick={() => setIsInvoiceModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-100 font-bold text-xs shadow-inner transition-all active:scale-95 cursor-pointer"
              >
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>Invoice OCR + Cost Guardrail</span>
              </button>

              <button
                onClick={fetchDashboardData}
                disabled={loading}
                className="p-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
                title="Sincronizar Ledger"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* ROW 1: SEMÁFORO KPI DE MERMA + SLIDER DE RETIRO HUMANO (2, 3, 4 DÍAS) */}
        {/* ==================================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 1. SEMÁFORO KPI DE MERMA (Neumorphic / Glassmorphic Traffic Light Card) */}
          <div
            className={`lg:col-span-5 relative overflow-hidden rounded-3xl p-6 transition-all duration-500 backdrop-blur-xl border ${
              isWasteExceedingTarget
                ? 'bg-gradient-to-br from-rose-950/75 via-zinc-900/90 to-zinc-950 border-rose-500/70 shadow-[0_0_40px_-5px_rgba(244,63,94,0.45)]'
                : 'bg-gradient-to-br from-emerald-950/60 via-zinc-900/90 to-zinc-950 border-emerald-500/50 shadow-[0_0_35px_-8px_rgba(16,185,129,0.35)]'
            }`}
          >
            {/* Ambient Glow Orb */}
            <div
              className={`pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl transition-all duration-500 ${
                isWasteExceedingTarget
                  ? 'bg-rose-500/30 animate-pulse'
                  : 'bg-emerald-500/20'
              }`}
            />

            <div className="relative z-10 flex flex-col justify-between h-full space-y-5">
              {/* Top Row: Title + Traffic Light Indicator */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-400 block">
                    KPI Financiero en Tiempo Real
                  </span>
                  <h2 className="text-lg sm:text-xl font-black text-white mt-0.5 flex items-center gap-2">
                    Semáforo KPI de Merma
                  </h2>
                </div>

                {/* Physical Neumorphic Traffic Light Housing */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-zinc-950/90 border border-zinc-800 shadow-inner">
                  {/* Green Lamp */}
                  <div
                    className={`w-4 h-4 rounded-full transition-all duration-300 ${
                      !isWasteExceedingTarget
                        ? 'bg-emerald-400 shadow-[0_0_14px_3px_rgba(52,211,153,0.9)] scale-110'
                        : 'bg-emerald-950/50 border border-emerald-900/40 opacity-30'
                    }`}
                    title="Bajo Meta (< 2.5%)"
                  />
                  {/* Red Blinking Lamp */}
                  <div
                    className={`w-4 h-4 rounded-full transition-all duration-300 ${
                      isWasteExceedingTarget
                        ? 'bg-rose-500 shadow-[0_0_16px_4px_rgba(244,63,94,0.95)] animate-ping'
                        : 'bg-rose-950/50 border border-rose-900/40 opacity-30'
                    }`}
                    title="Alerta Crítica (> 2.5%)"
                  />
                  <span
                    className={`text-[11px] font-black uppercase tracking-wider ml-1 ${
                      isWasteExceedingTarget
                        ? 'text-rose-400 animate-pulse'
                        : 'text-emerald-400'
                    }`}
                  >
                    {isWasteExceedingTarget ? 'ALERTA ROJA' : 'ÓPTIMO'}
                  </span>
                </div>
              </div>

              {/* Center Row: Big Percentage Readout vs Target_Waste_Pct */}
              <div className="flex items-baseline justify-between gap-4 py-2">
                <div>
                  <div className="flex items-baseline gap-2.5">
                    <span
                      className={`text-4xl sm:text-5xl font-black tracking-tight tabular-nums ${
                        isWasteExceedingTarget
                          ? 'text-rose-400 drop-shadow-[0_0_15px_rgba(244,63,94,0.6)] animate-pulse'
                          : 'text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.45)]'
                      }`}
                    >
                      {wastePctDisplay}
                    </span>
                    <span className="text-xs font-bold text-zinc-400">
                      / Meta{' '}
                      <strong className="text-white">
                        {(wasteKpi?.targetWastePct ?? 2.5).toFixed(1)}%
                      </strong>
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    {wasteKpi?.wastePct === null || wasteKpi?.wastePct === undefined ? (
                      <span className="text-zinc-400 font-medium">
                        Ventas brutas insuficientes para calcular % de merma (ledger en vivo).
                      </span>
                    ) : isWasteExceedingTarget ? (
                      <span className="text-rose-300 font-semibold flex items-center gap-1.5">
                        <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0 animate-bounce" />
                        ¡Merma supera Target_Waste_Pct por +
                        {(wasteKpi.wastePct - wasteKpi.targetWastePct).toFixed(2)}%!
                        Activar rescate de cocina.
                      </span>
                    ) : (
                      <span className="text-emerald-300/90 font-medium flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                        Merma controlada ({(wasteKpi.targetWastePct - wasteKpi.wastePct).toFixed(2)}% de margen seguro).
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Progress Gauge Bar */}
              <div className="space-y-1.5">
                <div className="h-3 w-full rounded-full bg-zinc-950 border border-zinc-800 overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isWasteExceedingTarget
                        ? 'bg-gradient-to-r from-amber-500 via-rose-500 to-red-600 animate-pulse'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    }`}
                    style={{
                      width:
                        wasteKpi?.wastePct != null
                          ? `${Math.min(100, (wasteKpi.wastePct / (wasteKpi.targetWastePct * 1.6)) * 100)}%`
                          : '0%',
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                  <span>0.0%</span>
                  <span className="text-amber-400 font-bold">
                    Umbral Meta: {wasteKpi?.targetWastePct ?? 2.5}%
                  </span>
                  <span>4.0%+</span>
                </div>
              </div>

              {/* Formula Breakdown & Quick Volumetric Bucket Simulator */}
              <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-800/90 space-y-2.5 text-xs">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-zinc-900/80 border border-zinc-800">
                    <span className="text-[10px] text-zinc-400 block">Descarte Directo</span>
                    <strong className="text-white font-mono">
                      ${(wasteKpi?.totalDiscardValue ?? 0).toFixed(2)}
                    </strong>
                  </div>
                  <div className="p-2 rounded-xl bg-zinc-900/80 border border-zinc-800">
                    <span className="text-[10px] text-zinc-400 block">Scraps (20L)</span>
                    <strong className="text-amber-300 font-mono">
                      ${(wasteKpi?.volumetricScrapValue ?? 0).toFixed(2)}
                    </strong>
                  </div>
                  <div className="p-2 rounded-xl bg-zinc-900/80 border border-zinc-800">
                    <span className="text-[10px] text-zinc-400 block">Ventas Brutas</span>
                    <strong className="text-emerald-300 font-mono">
                      ${(wasteKpi?.grossSalesRevenue ?? 0).toFixed(0)}
                    </strong>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80">
                  <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                    <Scale className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      Cubetas scrap registradas hoy:{' '}
                      {(wasteKpi?.volumetricScrapBucketsCount ?? 0).toFixed(1)}
                    </span>
                  </span>
                  {wasteKpi?.formulaBreakdown ? (
                    <span className="text-[10px] text-zinc-500 max-w-[55%] text-right">
                      {wasteKpi.formulaBreakdown}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* 2. SLIDER DE RETIRO HUMANO (2, 3 y 4 Días de Sensibilidad) */}
          <div className="lg:col-span-7 rounded-3xl bg-gradient-to-br from-zinc-900/90 via-zinc-900/60 to-zinc-950 border border-zinc-800/90 p-6 shadow-2xl backdrop-blur-xl flex flex-col justify-between space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-inner">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-black text-white">
                      Slider de Retiro Humano
                    </h2>
                    <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      Sensibilidad de Expiración
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Ajusta el umbral de días restantes (2, 3 o 4 días) para marcar lotes envejecidos en{' '}
                    <code className="text-emerald-300">Retail_Floor</code> y transferirlos a{' '}
                    <code className="text-amber-300">Kitchen_Prep</code>.
                  </p>
                </div>
              </div>

              {/* Dynamic Flagged Counter */}
              <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-amber-950/60 border border-amber-500/40 text-amber-200 shrink-0">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="text-xs">
                  <span className="font-black text-amber-300 text-sm">
                    {flaggedRetailItems.length} productos
                  </span>{' '}
                  <span className="text-amber-200/80">en ventana ≤{pullSensitivityDays}d</span>
                  <span className="block text-[10px] text-amber-400/90 font-mono">
                    Valor en riesgo: ${atRiskRetailValue.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Interactive Range Track (2 - 3 - 4 Days) */}
            <div className="px-2 pt-2 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  Ventana Activa de Retiro Preventivo:
                </span>
                <span className="px-3.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-black text-sm">
                  ≤ {pullSensitivityDays} Días para Expirar
                </span>
              </div>

              <input
                type="range"
                min={2}
                max={4}
                step={1}
                value={pullSensitivityDays}
                onChange={(e) =>
                  setPullSensitivityDays(
                    Number(e.target.value) as 2 | 3 | 4
                  )
                }
                aria-label="Sensibilidad de retiro humano en días"
                className="w-full h-3 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />

              <div className="flex justify-between text-[11px] font-bold text-zinc-500 px-1">
                <span className={pullSensitivityDays === 2 ? 'text-emerald-400' : ''}>
                  2 Días (Estricto)
                </span>
                <span className={pullSensitivityDays === 3 ? 'text-emerald-400' : ''}>
                  3 Días (Estándar)
                </span>
                <span className={pullSensitivityDays === 4 ? 'text-emerald-400' : ''}>
                  4 Días (Extendida)
                </span>
              </div>
            </div>

            {/* 3 Interactive Cards for 2, 3, and 4 Days */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {pullSensitivityOptions.map((option) => {
                const isSelected = pullSensitivityDays === option.days;
                const countForOption = ledgerRows.filter(
                  (r) => r.retailFloorQty > 0 && r.daysRemaining <= option.days
                ).length;

                return (
                  <button
                    key={option.days}
                    type="button"
                    onClick={() => setPullSensitivityDays(option.days)}
                    className={`group text-left p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-emerald-950/60 border-emerald-400/70 shadow-[0_0_25px_-5px_rgba(16,185,129,0.35)] scale-[1.01]'
                        : 'bg-zinc-950/60 border-zinc-800/90 hover:border-zinc-700 text-zinc-400'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs font-black ${
                            isSelected ? 'text-emerald-300' : 'text-zinc-200'
                          }`}
                        >
                          {option.title}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isSelected
                              ? 'bg-emerald-400 text-zinc-950'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {countForOption} ítems
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        {option.subtitle}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px] font-bold">
                      <span
                        className={
                          isSelected ? 'text-emerald-400' : 'text-zinc-500'
                        }
                      >
                        {option.badge}
                      </span>
                      {isSelected && (
                        <span className="text-emerald-300 flex items-center gap-1">
                          Activo <CheckCircle2 className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* ROW 2: SUB-INVENTORY CONTROLS & FILTER BAR                           */}
        {/* ==================================================================== */}
        <div className="rounded-3xl bg-zinc-900/80 border border-zinc-800/90 p-4 sm:p-5 shadow-xl backdrop-blur-xl space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Location View Switcher */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveLocationTab('SPLIT_VIEW')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all cursor-pointer ${
                  activeLocationTab === 'SPLIT_VIEW'
                    ? 'bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20'
                    : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Vista Dual (Retail_Floor + Kitchen_Prep)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveLocationTab('Retail_Floor')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all cursor-pointer ${
                  activeLocationTab === 'Retail_Floor'
                    ? 'bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20'
                    : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
                }`}
              >
                <Store className="w-4 h-4" />
                <span>Retail_Floor ({retailFloorRows.length})</span>
                <span className="px-2 py-0.5 rounded-full bg-zinc-900/30 text-[10px] font-mono">
                  ${totalRetailFloorValue.toFixed(0)} COGS
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveLocationTab('Kitchen_Prep')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all cursor-pointer ${
                  activeLocationTab === 'Kitchen_Prep'
                    ? 'bg-amber-400 text-zinc-950 shadow-lg shadow-amber-400/20'
                    : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
                }`}
              >
                <ChefHat className="w-4 h-4" />
                <span>Kitchen_Prep ({kitchenPrepRows.length})</span>
                <span className="px-2 py-0.5 rounded-full bg-zinc-900/30 text-[10px] font-mono">
                  ${totalKitchenPrepValue.toFixed(0)} COGS
                </span>
              </button>
            </div>

            {/* Search, Department Filter & Pull Filter */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative flex-1 sm:w-60">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar producto, PLU o proveedor..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                aria-label="Filtrar por departamento"
                className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-semibold text-zinc-200 focus:outline-none focus:border-emerald-500/60"
              >
                <option value="ALL">Todos los Deptos</option>
                <option value="PRODUCE">Produce (Frutas/Verduras)</option>
                <option value="DAIRY">Dairy (Lácteos)</option>
                <option value="BAKERY">Bakery (Panadería)</option>
                <option value="PANTRY">Pantry (Abarrotes)</option>
                <option value="DELI_KITCHEN">Deli Kitchen (Preparados)</option>
              </select>

              <button
                type="button"
                onClick={() => setOnlyShowFlaggedPulls((v) => !v)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  onlyShowFlaggedPulls
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Filter className="w-3.5 h-3.5 text-amber-400" />
                <span>Solo Retiros (≤{pullSensitivityDays}d)</span>
              </button>
            </div>
          </div>
        </div>

        <OperationsLiveTransfers
          pullDays={pullSensitivityDays}
          onLedgerRefresh={() => void fetchDashboardData()}
        />

        {/* ==================================================================== */}
        {/* ROW 3: TABLAS DE SUB-INVENTARIOS (Retail_Floor vs. Kitchen_Prep)     */}
        {/* ==================================================================== */}
        <div
          className={`grid grid-cols-1 gap-6 ${
            activeLocationTab === 'SPLIT_VIEW' ? 'xl:grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {/* PANEL A: RETAIL_FLOOR SUB-INVENTORY TABLE */}
          {(activeLocationTab === 'SPLIT_VIEW' ||
            activeLocationTab === 'Retail_Floor') && (
            <div className="rounded-3xl bg-zinc-900/85 border border-emerald-900/50 overflow-hidden shadow-2xl flex flex-col">
              {/* Panel Header */}
              <div className="p-5 bg-gradient-to-r from-emerald-950/60 via-zinc-900 to-zinc-950 border-b border-zinc-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400">
                    <Store className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base sm:text-lg font-black text-white">
                        Sub-Inventario: <code className="text-emerald-400">Retail_Floor</code>
                      </h3>
                      <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                        Piso de Venta
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Stock calculado vía <code className="text-zinc-300">SUM(Qty_Change)</code> • Sensibilidad activa: ≤{pullSensitivityDays} días
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-bold text-zinc-400 block">
                    Valor en Piso (MAC)
                  </span>
                  <strong className="text-lg font-black text-emerald-400 font-mono">
                    ${totalRetailFloorValue.toFixed(2)}
                  </strong>
                </div>
              </div>

              {/* Table Body */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-950/80 text-[11px] font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
                      <th className="py-3 px-4">Producto / PLU</th>
                      <th className="py-3 px-3">Depto</th>
                      <th className="py-3 px-3 text-right">Stock Piso</th>
                      <th className="py-3 px-3 text-right">Costo MAC</th>
                      <th className="py-3 px-3 text-center">Vida Útil</th>
                      <th className="py-3 px-4 text-right">Transfer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70 text-xs">
                    {retailFloorRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-10 text-center text-zinc-500 font-medium"
                        >
                          No hay productos en Retail_Floor que coincidan con el filtro actual.
                        </td>
                      </tr>
                    ) : (
                      retailFloorRows.map((row) => {
                        const isPullFlagged =
                          row.daysRemaining <= pullSensitivityDays;
                        return (
                          <tr
                            key={row.productId}
                            className={`transition-colors ${
                              isPullFlagged
                                ? 'bg-amber-950/25 hover:bg-amber-950/40'
                                : 'hover:bg-zinc-800/40'
                            }`}
                          >
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white">
                                  {row.name}
                                </span>
                                {isPullFlagged && (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-300 text-[10px] font-extrabold uppercase">
                                    Retirar
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                                SKU: {row.barcode} • {row.supplier}
                              </div>
                            </td>

                            <td className="py-3.5 px-3">
                              {row.department === 'DELI_KITCHEN' ? (
                                <span className="px-2.5 py-1 rounded-full bg-teal-950 text-teal-300 border border-teal-500/30 text-[10px] font-extrabold">
                                  DELI
                                </span>
                              ) : (
                                <DepartmentBadge
                                  department={row.department}
                                  size="sm"
                                />
                              )}
                            </td>

                            <td className="py-3.5 px-3 text-right font-mono">
                              <span className="font-extrabold text-white text-sm">
                                {row.retailFloorQty}
                              </span>{' '}
                              <span className="text-zinc-400 text-[11px]">
                                {row.unitType}
                              </span>
                            </td>

                            <td className="py-3.5 px-3 text-right font-mono">
                              <div className="text-zinc-200 font-bold">
                                ${row.movingAvgCost.toFixed(2)}
                              </div>
                              <div className="text-[10px] text-emerald-400">
                                PVP ${row.retailPrice.toFixed(2)}
                              </div>
                            </td>

                            <td className="py-3.5 px-3 text-center">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-extrabold ${
                                  row.daysRemaining <= 2
                                    ? 'bg-rose-950/90 text-rose-300 border border-rose-500/50'
                                    : isPullFlagged
                                    ? 'bg-amber-950/90 text-amber-300 border border-amber-500/50'
                                    : 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/30'
                                }`}
                              >
                                <Clock className="w-3 h-3" />
                                {row.daysRemaining}d
                              </span>
                            </td>

                            <td className="py-3.5 px-4 text-right text-[10px] text-zinc-500">
                              Live panel ↑
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PANEL B: KITCHEN_PREP SUB-INVENTORY TABLE */}
          {(activeLocationTab === 'SPLIT_VIEW' ||
            activeLocationTab === 'Kitchen_Prep') && (
            <div className="rounded-3xl bg-zinc-900/85 border border-amber-900/50 overflow-hidden shadow-2xl flex flex-col">
              {/* Panel Header */}
              <div className="p-5 bg-gradient-to-r from-amber-950/60 via-zinc-900 to-zinc-950 border-b border-zinc-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-400">
                    <ChefHat className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base sm:text-lg font-black text-white">
                        Sub-Inventario: <code className="text-amber-400">Kitchen_Prep</code>
                      </h3>
                      <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-500/30">
                        Cocina de Rescate &amp; BOM
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Insumos rescatados listos para manufactura (<code className="text-zinc-300">/api/manufacturing</code>) y lotes terminados.
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-bold text-zinc-400 block">
                    Valor en Cocina (MAC)
                  </span>
                  <strong className="text-lg font-black text-amber-400 font-mono">
                    ${totalKitchenPrepValue.toFixed(2)}
                  </strong>
                </div>
              </div>

              {/* Table Body */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-950/80 text-[11px] font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
                      <th className="py-3 px-4">Insumo / Producto Deli</th>
                      <th className="py-3 px-3">Tipo</th>
                      <th className="py-3 px-3 text-right">Stock Cocina</th>
                      <th className="py-3 px-3 text-right">Yield %</th>
                      <th className="py-3 px-3 text-right">Valor Lote</th>
                      <th className="py-3 px-4 text-right">Estado BOM</th>
                      <th className="py-3 px-4 text-right">Transfer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/70 text-xs">
                    {kitchenPrepRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-10 text-center text-zinc-500 font-medium"
                        >
                          No hay insumos en Kitchen_Prep que coincidan con el filtro actual.
                        </td>
                      </tr>
                    ) : (
                      kitchenPrepRows.map((row) => {
                        const lineTotalCost =
                          row.kitchenPrepQty * row.movingAvgCost;

                        return (
                          <tr
                            key={row.productId}
                            className={`transition-colors ${
                              row.isManufactured
                                ? 'bg-emerald-950/20 hover:bg-emerald-950/35'
                                : 'hover:bg-zinc-800/40'
                            }`}
                          >
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-white flex items-center gap-2">
                                <span>{row.name}</span>
                              </div>
                              <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                                Costo MAC: ${row.movingAvgCost.toFixed(2)} /{' '}
                                {row.unitType}
                              </div>
                            </td>

                            <td className="py-3.5 px-3">
                              {row.isManufactured ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-[10px] font-extrabold">
                                  <PackageCheck className="w-3 h-3" />
                                  Lote Terminado
                                </span>
                              ) : (
                                <DepartmentBadge
                                  department={
                                    row.department === 'DELI_KITCHEN'
                                      ? 'PRODUCE'
                                      : row.department
                                  }
                                  size="sm"
                                />
                              )}
                            </td>

                            <td className="py-3.5 px-3 text-right font-mono">
                              <span className="font-extrabold text-amber-300 text-sm">
                                {row.kitchenPrepQty}
                              </span>{' '}
                              <span className="text-zinc-400 text-[11px]">
                                {row.unitType}
                              </span>
                            </td>

                            <td className="py-3.5 px-3 text-right font-mono">
                              <span className="px-2 py-0.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 font-bold">
                                {row.yieldPct}%
                              </span>
                            </td>

                            <td className="py-3.5 px-3 text-right font-mono font-bold text-white">
                              ${lineTotalCost.toFixed(2)}
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              {row.isManufactured ? (
                                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
                                  PVP ${row.retailPrice.toFixed(2)} ({row.targetMarginPct}% Margen)
                                </span>
                              ) : (
                                <Link
                                  href="/kitchen"
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-bold transition-all"
                                >
                                  <UtensilsCrossed className="w-3 h-3" />
                                  <span>Asignado a BOM</span>
                                </Link>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right text-[10px] text-zinc-500">
                              Live panel ↑
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ==================================================================== */}
        {/* ROW 3.5: PHASE 5 VOLUMETRIC SCRAP 1-CLICK FORM (20L BUCKETS)        */}
        {/* ==================================================================== */}
        <VolumetricScrapForm
          totalBucketsLoggedToday={wasteKpi?.volumetricScrapBucketsCount ?? 0}
          onLogScrapBuckets={(bucketsDelta, event) => {
            void (async () => {
              try {
                const res = await fetch('/api/inventory/volumetric-scrap', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    buckets: bucketsDelta,
                    staffId: 'staff-kitchen',
                  }),
                });
                const json = (await res.json()) as { success?: boolean; error?: string };
                if (!res.ok || !json.success) {
                  throw new Error(json.error ?? 'Could not log volumetric scrap.');
                }
                await fetchDashboardData();
                setTransferToast(
                  `Scrap Volumétrico Registrado: +${bucketsDelta} cubeta(s) 20L (${event.estimatedWeightKg} kg = +$${event.estimatedScrapCostValue.toFixed(
                    2
                  )})`
                );
                setTimeout(() => setTransferToast(null), 4000);
              } catch (err) {
                const message =
                  err instanceof Error ? err.message : 'Could not log volumetric scrap.';
                setTransferToast(message);
                setTimeout(() => setTransferToast(null), 5000);
              }
            })();
          }}
          onResetBuckets={() => void fetchDashboardData()}
        />

        {/* ==================================================================== */}
        {/* ROW 4: ACTIVE KITCHEN RESCUE RECIPES & DELI LABEL QUEUE              */}
        {/* ==================================================================== */}
        <div className="rounded-3xl bg-zinc-900/75 border border-zinc-800/90 p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <UtensilsCrossed className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white">
                  Recetas BOM Activas en Cocina &amp; Etiquetado Grab-n-Go
                </h3>
                <p className="text-xs text-zinc-400">
                  Transformación de insumos en <code className="text-amber-300">Kitchen_Prep</code> hacia productos preparados de alto margen.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
              <button
                type="button"
                onClick={() => setIsRecipeProductionModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-black transition-all cursor-pointer"
              >
                <ChefHat className="w-3.5 h-3.5" />
                <span>Ejecutar Producción BOM</span>
              </button>
              <Link
                href="/kitchen"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-200 transition-all"
              >
                <span>Abrir Motor de Recetas</span>
                <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recipes.slice(0, 3).map((recipe) => (
              <div
                key={recipe.id}
                className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800/90 hover:border-emerald-500/40 transition-all flex flex-col justify-between space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                      {recipe.category}
                    </span>
                    <span className="text-xs font-extrabold text-emerald-400">
                      {recipe.grossMarginPct}% Margen
                    </span>
                  </div>
                  <h4 className="font-extrabold text-sm text-white">
                    {recipe.recipeName}
                  </h4>
                  <p className="text-[11px] text-zinc-400">
                    Rendimiento: <strong className="text-zinc-200">{recipe.estimatedYield}</strong> • PVP:{' '}
                    <strong className="text-emerald-400">${recipe.targetRetailPrice.toFixed(2)}</strong>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedDeliRecipe(recipe)}
                  className="w-full py-2 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir Etiqueta Deli</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Modals */}
      <InvoiceUploadModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        onInvoiceImported={(result: InvoiceOcrResult) => {
          stashInvoiceForReceiving(result);
          setIsInvoiceModalOpen(false);
          router.push('/receive');
        }}
      />

      <VoiceLoggerModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onVoiceConfirmed={(result: ConfirmedVoiceCommitResult) => {
          // Reflect confirmed voice transfers/discards immediately in Sub-Inventories
          setLedgerRows((prev) =>
            prev.map((row) => {
              const matchedItems = result.items.filter(
                (it) => it.product_id === row.productId
              );
              if (matchedItems.length === 0) return row;

              let updatedRetail = row.retailFloorQty;
              let updatedKitchen = row.kitchenPrepQty;

              for (const item of matchedItems) {
                const qty = Math.min(updatedRetail, item.quantity);
                updatedRetail = Number((updatedRetail - qty).toFixed(2));
                if (item.target_action === 'PULL_RESCUE') {
                  updatedKitchen = Number((updatedKitchen + qty).toFixed(2));
                }
              }

              return {
                ...row,
                retailFloorQty: updatedRetail,
                kitchenPrepQty: updatedKitchen,
              };
            })
          );
          fetchDashboardData();
        }}
      />

      <RecipeProductionModal
        isOpen={isRecipeProductionModalOpen}
        onClose={() => setIsRecipeProductionModalOpen(false)}
        onBatchProduced={(summary: ProductionBatchExecutedSummary) => {
          // Reflect BOM ingredient deductions and finished output in Kitchen_Prep
          setLedgerRows((prev) =>
            prev.map((row) => {
              const consumed = summary.ingredientsUsed.find(
                (ing) => ing.ingredientProductId === row.productId
              );
              if (consumed) {
                return {
                  ...row,
                  kitchenPrepQty: Math.max(
                    0,
                    Number(
                      (row.kitchenPrepQty - consumed.actualQtyUsed).toFixed(2)
                    )
                  ),
                };
              }
              if (row.productId === summary.outputProductId) {
                return {
                  ...row,
                  kitchenPrepQty: Number(
                    (row.kitchenPrepQty + summary.batchOutputQty).toFixed(2)
                  ),
                  movingAvgCost: summary.unitOutputCost,
                };
              }
              return row;
            })
          );
          setTransferToast(
            `Lote Producido: +${summary.batchOutputQty} uds de "${summary.outputProductName}" en Kitchen_Prep`
          );
          setTimeout(() => setTransferToast(null), 4000);
          fetchDashboardData();
        }}
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
