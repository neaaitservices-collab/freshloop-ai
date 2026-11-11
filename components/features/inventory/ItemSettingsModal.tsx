'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { PricingYieldCard } from '@/components/ui/PricingYieldCard';
import type { StockLevel, StockOverrideAudit } from '@/lib/domains/inventory/stock';
import {
  applyPresetMarginToUnitPrice,
  formatUnitPriceFromCase,
  parseCatalogPriceInput,
  sellableCountForPack,
} from '@/lib/domains/receiving/catalogItemPricing';
import {
  catalogCaseFloorPrice,
  catalogDisplayCaseCost,
  calculateYieldQuote,
  formatFractionalCases,
  formatUnits,
  inferMarginModeFromFloorPrice,
  normalizeStoredUnitFloorPrice,
  resolvePricingEconomics,
  resolveTargetMargin,
  retailUnitForUnitType,
  sellableUnitsPerCase,
  stockUnitLabel,
  type MarginMode,
  type RetailUnit,
  type YieldQuote,
} from '@/lib/domains/receiving/yieldPricing';
import { CATALOG_DEPARTMENTS, departmentLabel } from '@/lib/domains/inventory/inventoryCatalog';
import { ModalBody, ModalFooter, ModalHeader, ModalShell } from '@/components/ui/layout';
import { ParCasesToggle } from '@/components/ui/ParCasesToggle';
import { PullDaysToggle } from '@/components/ui/PullDaysToggle';
import { useStoreDefaultParCases } from '@/hooks/use-store-default-par-cases';
import { useStorePullSensitivityDays } from '@/hooks/use-store-pull-sensitivity-days';
import { normalizeParCases } from '@/lib/domains/inventory/parLevel';
import {
  parseProductPullOverride,
  type PullSensitivityDays,
} from '@/lib/domains/inventory/pullSensitivity';
import { cn } from '@/lib/utils/cn';

const INPUT =
  'mt-2 min-h-11 w-full rounded-xl border border-slate-700/90 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition focus:border-emerald-500/45 focus:ring-1 focus:ring-emerald-500/20';

const LABEL = 'text-[11px] font-bold uppercase tracking-wide text-slate-400';

type TabId = 'overview' | 'pricing';

function CaseCountCell({
  unitsOnHand,
  unitsPerCase,
  emphasis,
}: {
  unitsOnHand: number;
  unitsPerCase: number;
  emphasis: 'ledger' | 'physical';
}) {
  const formatted = formatFractionalCases(unitsOnHand, unitsPerCase);
  return (
    <div className="text-right leading-tight">
      <p
        className={cn(
          'text-sm font-bold',
          emphasis === 'ledger' ? 'text-slate-100' : 'text-emerald-300'
        )}
      >
        {formatted.primary}
      </p>
      <p className="mt-0.5 text-[10px] font-medium text-slate-500">{formatted.decimal} cs decimal</p>
    </div>
  );
}

function SubCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-slate-800 bg-slate-950/40 p-5 sm:p-6',
        className
      )}
    >
      <header className="mb-5 border-b border-slate-800/80 pb-4">
        <h3 className="text-sm font-black tracking-tight text-slate-100">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function ItemSettingsModal({
  row,
  open,
  onClose,
  canOverride,
  canRemoveFromCatalog,
  onRemoveFromCatalog,
  onSaveMetadata,
  onSaveCase,
  onUpdatePhysicalCount,
}: {
  row: StockLevel | null;
  open: boolean;
  onClose: () => void;
  canOverride: boolean;
  canRemoveFromCatalog?: boolean;
  onRemoveFromCatalog?: () => Promise<void>;
  onSaveMetadata: (payload: {
    department: string;
    supplier: string;
    origin: string;
    pullSensitivityDays: PullSensitivityDays | null;
    parCases: number;
  }) => Promise<void>;
  onSaveCase: (payload: {
    packSize: number;
    splitFactor: number;
    retailUnit: RetailUnit;
    retailPrice: number;
    caseRetailPrice?: number | null;
    caseCost: number;
  }) => Promise<void>;
  onUpdatePhysicalCount: (cases: number) => Promise<StockOverrideAudit | null>;
}) {
  const [tab, setTab] = useState<TabId>('overview');
  const [department, setDepartment] = useState('');
  const [supplier, setSupplier] = useState('');
  const [origin, setOrigin] = useState('');
  const storePullDefault = useStorePullSensitivityDays();
  const storeDefaultParCases = useStoreDefaultParCases();
  const [pullSensitivityDays, setPullSensitivityDays] = useState<PullSensitivityDays | null>(null);
  const [followStorePar, setFollowStorePar] = useState(true);
  const [customParCases, setCustomParCases] = useState('2');
  const [packSize, setPackSize] = useState('1');
  const [splitFactor, setSplitFactor] = useState('1');
  const [packUnit, setPackUnit] = useState<RetailUnit>('units');
  const [yieldUnit, setYieldUnit] = useState<RetailUnit>('units');
  const [marginMode, setMarginMode] = useState<MarginMode>('40');
  const [currentRetailPrice, setCurrentRetailPrice] = useState('0');
  const [physicalCases, setPhysicalCases] = useState('0');
  const [audit, setAudit] = useState<StockOverrideAudit | null>(null);
  const [busy, setBusy] = useState<'meta' | 'case' | 'stock' | 'remove' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const skipFloorRecalc = useRef(true);
  const floorFromMargin = useRef(true);
  /** True after user edits case cost — blocks row sync from wiping pending value before save. */
  const caseCostDirtyRef = useRef(false);
  const [anchoredCaseCost, setAnchoredCaseCost] = useState(0);
  const [catalogCaseCostBaseline, setCatalogCaseCostBaseline] = useState(0);
  const [caseCostEditing, setCaseCostEditing] = useState(false);
  const [caseCostInput, setCaseCostInput] = useState('');
  const [currentCaseFloor, setCurrentCaseFloor] = useState('');

  const effectiveParCases = useMemo(() => {
    if (followStorePar) return storeDefaultParCases;
    const raw = Number(customParCases);
    return normalizeParCases(Number.isFinite(raw) ? raw : storeDefaultParCases);
  }, [followStorePar, customParCases, storeDefaultParCases]);

  const applyPresetUnitPrice = useCallback((mode: MarginMode, unitCost: number) => {
    if (mode !== '35' && mode !== '40') return;
    const unitPrice = applyPresetMarginToUnitPrice({ mode, unitCost });
    if (unitPrice) setCurrentRetailPrice(unitPrice);
  }, []);

  useEffect(() => {
    if (!open || !row) return;
    skipFloorRecalc.current = true;
    floorFromMargin.current = true;
    setTab('overview');
    setDepartment(row.department);
    setSupplier(row.supplier);
    setOrigin(row.origin ?? '');
    setPullSensitivityDays(parseProductPullOverride(row.pullSensitivityDays));
    const atStorePar = row.parCases === storeDefaultParCases;
    setFollowStorePar(atStorePar);
    setCustomParCases(String(row.parCases > 0 ? row.parCases : storeDefaultParCases));
    const packVal = row.receivePackSize > 0 ? row.receivePackSize : row.casePackSize > 0 ? row.casePackSize : 1;
    const divVal = row.splitFactor > 0 ? row.splitFactor : 1;
    setPackSize(String(packVal));
    setSplitFactor(String(divVal));
    const unit = retailUnitForUnitType(row.unitType);
    setPackUnit(unit);
    setYieldUnit(unit);
    const econ = resolvePricingEconomics({
      standardCost: row.unitCost,
      packSize: packVal,
      splitFactor: divVal,
    });
    const caseCostBaseline = catalogDisplayCaseCost({
      receiveCaseCost: row.receiveCaseCost,
      standardCost: row.unitCost,
      packSize: packVal,
      splitFactor: divVal,
    });
    setAnchoredCaseCost(caseCostBaseline);
    setCatalogCaseCostBaseline(caseCostBaseline);
    setCaseCostInput(caseCostBaseline > 0 ? caseCostBaseline.toFixed(2) : '');
    setCaseCostEditing(false);
    caseCostDirtyRef.current = false;
    const unitFloor =
      normalizeStoredUnitFloorPrice({
        retailPrice: row.retailPrice,
        unitCostPerSellable: econ.unitCostPerSellable,
        packSize: packVal,
        splitFactor: divVal,
      }) ?? row.retailPrice;
    const inferred = inferMarginModeFromFloorPrice({
      unitCostPerSellable: econ.unitCostPerSellable,
      retailPrice: unitFloor,
      packSize: packVal,
      splitFactor: divVal,
    });
    setMarginMode(inferred);
    if (row.caseRetailPrice != null && row.caseRetailPrice > 0) {
      setCurrentCaseFloor(row.caseRetailPrice.toFixed(2));
    } else {
      const impliedCase = catalogCaseFloorPrice({
        unitCostPerSellable: econ.unitCostPerSellable,
        casePackSize: row.casePackSize,
        receivePackSize: packVal,
        splitFactor: divVal,
        caseRetailPrice: null,
        retailPrice: row.retailPrice,
        marginMode: inferred === 'custom' ? undefined : inferred,
      });
      setCurrentCaseFloor(impliedCase != null && impliedCase > 0 ? impliedCase.toFixed(2) : '');
    }
    if (inferred === 'custom') {
      setCurrentRetailPrice(unitFloor != null && unitFloor > 0 ? unitFloor.toFixed(2) : '0');
      floorFromMargin.current = false;
    } else {
      applyPresetUnitPrice(inferred, econ.unitCostPerSellable);
    }
    setMessage(null);
    setError(null);
    const t = window.setTimeout(() => {
      skipFloorRecalc.current = false;
    }, 0);
    return () => window.clearTimeout(t);
    // Intentionally omit `row`: only re-hydrate when opening or switching product so polling
    // does not wipe in-progress edits. applyPresetUnitPrice is stable (useCallback []).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [open, row?.productId, applyPresetUnitPrice]);

  useEffect(() => {
    const onHandCases = row?.onHandCases;
    if (!open || row?.productId == null || onHandCases === undefined) return;
    setPhysicalCases(String(onHandCases));
  }, [open, row?.productId, row?.onHandCases]);

  useEffect(() => {
    if (!open || !row || caseCostEditing || busy === 'case' || caseCostDirtyRef.current) return;
    const packVal = row.receivePackSize > 0 ? row.receivePackSize : row.casePackSize > 0 ? row.casePackSize : 1;
    const divVal = row.splitFactor > 0 ? row.splitFactor : 1;
    const caseCostBaseline = catalogDisplayCaseCost({
      receiveCaseCost: row.receiveCaseCost,
      standardCost: row.unitCost,
      packSize: packVal,
      splitFactor: divVal,
    });
    setAnchoredCaseCost(caseCostBaseline);
    setCatalogCaseCostBaseline(caseCostBaseline);
    setCaseCostInput(caseCostBaseline > 0 ? caseCostBaseline.toFixed(2) : '');
  }, [
    open,
    row,
    caseCostEditing,
    busy,
  ]);

  useEffect(() => {
    const productId = row?.productId;
    if (!open || !productId) return;
    void fetch(`/api/inventory/levels?auditProductId=${encodeURIComponent(productId)}`, {
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.audit) setAudit(json.audit as StockOverrideAudit);
        else setAudit(null);
      })
      .catch(() => setAudit(null));
  }, [open, row?.productId]);

  const pack = toNumber(packSize);
  const divisor = toNumber(splitFactor);
  const priceNumber = toNumber(currentRetailPrice);
  const pricingEconomics = useMemo(() => {
    if (!row) return { caseCost: 0, unitCostPerSellable: 0 };
    const sellable = sellableUnitsPerCase(pack, divisor);
    if (anchoredCaseCost > 0 && sellable > 0) {
      return {
        caseCost: anchoredCaseCost,
        unitCostPerSellable: Number((anchoredCaseCost / sellable).toFixed(4)),
      };
    }
    return resolvePricingEconomics({
      standardCost: row.unitCost,
      packSize: pack,
      splitFactor: divisor,
    });
  }, [row, pack, divisor, anchoredCaseCost]);
  const { caseCost, unitCostPerSellable } = pricingEconomics;
  const caseCostOverridden = Math.abs(caseCost - catalogCaseCostBaseline) >= 0.005;

  const targetMargin =
    marginMode === 'custom' && priceNumber > 0 && unitCostPerSellable > 0
      ? Math.max(0, Math.min(0.99, (priceNumber - unitCostPerSellable) / priceNumber))
      : resolveTargetMargin(marginMode, 0);

  useEffect(() => {
    if (!open || !row || skipFloorRecalc.current) return;
    if (marginMode === 'custom' || !floorFromMargin.current) return;
    if (sellableCountForPack(pack, divisor) === null) return;
    applyPresetUnitPrice(marginMode, unitCostPerSellable);
  }, [
    open,
    row,
    packSize,
    splitFactor,
    pack,
    divisor,
    marginMode,
    unitCostPerSellable,
    applyPresetUnitPrice,
  ]);

  useEffect(() => {
    if (!open || !row || skipFloorRecalc.current || marginMode !== 'custom') return;
    const caseVal = parseCatalogPriceInput(currentCaseFloor);
    if (caseVal === null || !(caseVal > 0)) return;
    if (sellableCountForPack(pack, divisor) === null) return;
    setCurrentRetailPrice(formatUnitPriceFromCase(caseVal, pack, divisor));
  }, [
    open,
    row,
    packSize,
    splitFactor,
    marginMode,
    pack,
    divisor,
    currentCaseFloor,
  ]);

  const quote: YieldQuote = useMemo(
    () =>
      calculateYieldQuote({
        caseCost,
        packSize: pack,
        splitFactor: divisor,
        targetMargin,
        currentRetailPrice: priceNumber,
      }),
    [caseCost, pack, divisor, targetMargin, priceNumber]
  );
  const applyMarginMode = (mode: MarginMode) => {
    floorFromMargin.current = mode !== 'custom';
    setMarginMode(mode);
    if (mode === '35' || mode === '40') {
      applyPresetUnitPrice(mode, unitCostPerSellable);
    }
  };

  const syncCaseToUnit = (caseRaw: string, caseDisplay: string) => {
    setCurrentCaseFloor(caseDisplay);
    const caseVal = parseCatalogPriceInput(caseRaw);
    if (caseVal === null) {
      setCurrentRetailPrice('');
      return;
    }
    if (caseVal === 0) {
      setCurrentRetailPrice('');
      return;
    }
    if (sellableCountForPack(pack, divisor) === null) return;
    setCurrentRetailPrice(formatUnitPriceFromCase(caseVal, pack, divisor));
  };

  const onFloorPriceChange = (value: string) => {
    floorFromMargin.current = false;
    setMarginMode('custom');
    setCurrentRetailPrice(value.trim() ? value : '');
  };

  const onCaseShelfPriceChange = (value: string) => {
    if (!value.trim()) {
      setCurrentCaseFloor('');
      if (marginMode === 'custom') setCurrentRetailPrice('');
      return;
    }
    setCurrentCaseFloor(value);
    if (marginMode === 'custom') {
      floorFromMargin.current = false;
      syncCaseToUnit(value, value);
    }
  };

  if (!open || !row) return null;

  const ledgerUnitsPerCase = row.casePackSize > 0 ? row.casePackSize : 1;
  const sellUnit = retailUnitForUnitType(row.unitType);
  const systemUnits = row.onHand;
  const systemCases = row.onHandCases;
  const physicalCasesNum = toNumber(physicalCases);
  const physicalUnitsPreview = physicalCasesNum * ledgerUnitsPerCase;
  const overrideDiffersFromLedger = Math.abs(physicalCasesNum - systemCases) >= 0.01;
  const physicalCaseHint = formatFractionalCases(physicalUnitsPreview, ledgerUnitsPerCase);

  return (
    <ModalShell open zIndexClass="z-[110]" width="lg" onClose={onClose}>
        <ModalHeader className="px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/90">Item settings</p>
              <h2 className="truncate text-xl font-black tracking-tight text-white">{row.name}</h2>
              <p className="mt-1 truncate text-sm text-slate-400">{row.supplier || 'Unassigned supplier'}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="pointer-events-auto relative z-30 min-h-11 min-w-11 rounded-xl p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
              aria-label="Close item settings"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="mt-5 flex gap-1.5 rounded-xl bg-slate-950 p-1.5" aria-label="Item settings sections">
            {(
              [
                ['overview', 'Overview'],
                ['pricing', 'Pricing'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTab(id);
                  setMessage(null);
                  setError(null);
                }}
                className={cn(
                  'flex-1 min-h-11 rounded-lg py-2.5 text-xs font-black uppercase tracking-wide transition',
                  tab === id ? 'bg-emerald-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        </ModalHeader>

        <ModalBody className="px-6 py-5">
          {tab === 'overview' ? (
            <div className="space-y-5">
              <SubCard
                title="Item hierarchy & metadata"
                description="Department, supplier, and origin used for catalog filters and reporting."
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block sm:col-span-1">
                    <span className={LABEL}>Department</span>
                    <select value={department} onChange={(e) => setDepartment(e.target.value)} className={INPUT}>
                      {CATALOG_DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>
                          {departmentLabel(d)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block sm:col-span-1">
                    <span className={LABEL}>Category</span>
                    <input readOnly value={departmentLabel(department)} className={cn(INPUT, 'text-slate-500')} />
                    <span className="mt-1.5 block text-[11px] text-slate-600">Mirrors department.</span>
                  </label>
                  <label className="block sm:col-span-1">
                    <span className={LABEL}>Type</span>
                    <input readOnly value={row.productType} className={cn(INPUT, 'text-slate-500')} />
                  </label>
                  <label className="block sm:col-span-1">
                    <span className={LABEL}>Origin</span>
                    <input
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      placeholder="e.g. Mexico, local farm"
                      className={INPUT}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className={LABEL}>Supplier</span>
                    <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={INPUT} />
                  </label>
                </div>
                <div className="mt-5 border-t border-slate-800/80 pt-5">
                  <p className={LABEL}>Pull / freshness window</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Flag this SKU for rescue when shelf life is within N days. Active window: ≤
                    {pullSensitivityDays ?? storePullDefault}d
                    {pullSensitivityDays === null ? ' (store default)' : ''}.
                  </p>
                  <PullDaysToggle
                    className="mt-3"
                    idPrefix="catalog-pull"
                    allowStoreDefault
                    storeDefault={storePullDefault}
                    value={pullSensitivityDays}
                    onChange={setPullSensitivityDays}
                  />
                </div>
                <div className="mt-5 border-t border-slate-800/80 pt-5">
                  <p className={LABEL}>Order minimum (cases)</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Orders and low-stock alerts when on-hand cases fall below this level. Use store
                    default unless this SKU needs a different par.
                  </p>
                  <ParCasesToggle
                    className="mt-3"
                    idPrefix="catalog-par"
                    storeDefault={storeDefaultParCases}
                    followStoreDefault={followStorePar}
                    onFollowStoreDefaultChange={setFollowStorePar}
                    customCases={customParCases}
                    onCustomCasesChange={setCustomParCases}
                  />
                </div>
                <button
                  type="button"
                  disabled={busy === 'meta'}
                  onClick={() => {
                    setBusy('meta');
                    setError(null);
                    const parCases = followStorePar
                      ? storeDefaultParCases
                      : normalizeParCases(Number(customParCases));
                    void onSaveMetadata({
                      department,
                      supplier,
                      origin,
                      pullSensitivityDays,
                      parCases,
                    })
                      .then(() => setMessage('Metadata saved.'))
                      .catch((e: Error) => setError(e.message))
                      .finally(() => setBusy(null));
                  }}
                  className="mt-6 w-full rounded-xl border border-slate-700 bg-slate-800/80 py-3 text-sm font-black text-emerald-300 transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {busy === 'meta' ? 'Saving…' : 'Save metadata'}
                </button>
              </SubCard>

              <SubCard
                title="Stock status & audit"
                description="Ledger counts vs what you enter for a physical walk-through."
              >
                {row.low ? (
                  <div className="mb-5 flex items-start gap-3 rounded-xl border border-rose-900/50 bg-rose-950/30 px-4 py-3.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden />
                    <div>
                      <p className="text-sm font-black text-rose-100">Below par</p>
                      <p className="mt-0.5 text-xs text-rose-200/85">
                        {formatUnits(systemCases)} cases on hand · par {formatUnits(effectiveParCases)} cases —
                        consider ordering
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mb-5 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-xs text-slate-400">
                    Stock is at or above par ({formatUnits(effectiveParCases)} cases).
                  </p>
                )}

                <div className="overflow-hidden rounded-xl border border-slate-800">
                  <div className="border-b border-slate-800 bg-slate-900/60 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">On-hand snapshot</p>
                    <p className="mt-1 text-xs text-slate-500">
                      1 case = {formatUnits(ledgerUnitsPerCase)} {sellUnit}. Partial cases show as fractions
                      (e.g. 8 of 12 = 2/3 case).
                    </p>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_7rem] gap-x-3 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 sm:grid-cols-[minmax(0,1fr)_8rem_7rem]">
                    <span />
                    <span className="text-right">Cases</span>
                    <span className="text-right">Sellable</span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_7rem] items-center gap-x-3 border-t border-slate-800/80 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_7rem]">
                    <span className="text-xs font-semibold text-slate-400">System (ledger)</span>
                    <CaseCountCell
                      unitsOnHand={systemUnits}
                      unitsPerCase={ledgerUnitsPerCase}
                      emphasis="ledger"
                    />
                    <span className="font-mono text-right text-xs text-slate-400">
                      {formatUnits(systemUnits)} {stockUnitLabel(row.unitType)}
                    </span>
                  </div>
                  {overrideDiffersFromLedger ? (
                    <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_7rem] items-center gap-x-3 border-t border-slate-800/80 bg-emerald-950/20 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_7rem]">
                      <span className="text-xs font-semibold text-emerald-300/90">
                        After apply (draft)
                      </span>
                      <CaseCountCell
                        unitsOnHand={physicalUnitsPreview}
                        unitsPerCase={ledgerUnitsPerCase}
                        emphasis="physical"
                      />
                      <span className="font-mono text-right text-xs text-emerald-300/90">
                        {formatUnits(physicalUnitsPreview)} {sellUnit}
                      </span>
                    </div>
                  ) : null}
                </div>
              </SubCard>

              <SubCard
                title="Admin physical count override"
                description="Set cases on hand after a floor count. Apply pushes the update to inventory."
                className="border-emerald-900/25 bg-gradient-to-b from-emerald-950/15 to-slate-950/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {!canOverride ? (
                    <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Managers only
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
                  <label className="min-w-0 flex-1">
                    <span className={LABEL}>Cases on hand</span>
                    <div className="mt-2 flex overflow-hidden rounded-xl border border-slate-600 bg-slate-950 ring-1 ring-emerald-500/20 focus-within:border-emerald-500/40 focus-within:ring-emerald-400/30">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={physicalCases}
                        onChange={(e) => setPhysicalCases(e.target.value)}
                        disabled={!canOverride}
                        className="min-w-0 flex-1 bg-transparent px-4 py-3 font-mono text-lg font-bold text-white outline-none disabled:opacity-45"
                      />
                      <span className="flex items-center border-l border-slate-700 bg-slate-900/90 px-4 text-xs font-bold uppercase tracking-wide text-slate-400">
                        cases
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      {physicalCaseHint.primary}
                      <span className="text-slate-600"> · </span>
                      {physicalCaseHint.detail}
                      {overrideDiffersFromLedger ? (
                        <>
                          <span className="text-slate-600"> · </span>
                          <span className="text-emerald-300/90">Press Apply count to update the ledger.</span>
                        </>
                      ) : null}
                    </p>
                  </label>
                  <button
                    type="button"
                    aria-busy={busy === 'stock'}
                    disabled={!canOverride || busy === 'stock' || physicalCasesNum < 0}
                    onClick={() => {
                      setBusy('stock');
                      setError(null);
                      void onUpdatePhysicalCount(physicalCasesNum)
                        .then((nextAudit) => {
                          setAudit(nextAudit);
                          setMessage('Physical count updated.');
                        })
                        .catch((e: Error) => setError(e.message))
                        .finally(() => setBusy(null));
                    }}
                    className="w-full shrink-0 rounded-xl bg-emerald-400 px-6 py-3.5 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[10.5rem]"
                  >
                    {busy === 'stock' ? 'Applying…' : 'Apply count'}
                  </button>
                </div>

                <p className="mt-4 rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 py-2.5 text-[11px] text-slate-500">
                  {audit ? (
                    <>
                      Last override{' '}
                      <span className="font-medium text-slate-300">
                        {new Date(audit.timestamp).toLocaleString()} · {audit.staffName ?? audit.staffId}
                      </span>
                    </>
                  ) : (
                    'No admin override recorded yet.'
                  )}
                </p>
              </SubCard>

              {canRemoveFromCatalog && onRemoveFromCatalog ? (
                <SubCard
                  title="Remove from catalog"
                  description="Hides this SKU from admin and receiving lists. Ledger history is kept. Receiving the same item again will restore it."
                  className="border-rose-900/30 bg-rose-950/10"
                >
                  <button
                    type="button"
                    disabled={busy === 'remove'}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Remove "${row.name}" from the catalog? This cannot be undone from the UI except by receiving the item again.`
                        )
                      ) {
                        return;
                      }
                      setBusy('remove');
                      setError(null);
                      void onRemoveFromCatalog()
                        .then(() => setMessage('Item removed from catalog.'))
                        .catch((e: Error) => setError(e.message))
                        .finally(() => setBusy(null));
                    }}
                    className="w-full rounded-xl border border-rose-800/60 bg-rose-950/40 py-3 text-sm font-black text-rose-200 transition hover:bg-rose-950/60 disabled:opacity-50"
                  >
                    {busy === 'remove' ? 'Removing…' : 'Remove from catalog (admin)'}
                  </button>
                </SubCard>
              ) : null}
            </div>
          ) : null}

          {tab === 'pricing' ? (
            <PricingYieldCard
              compactHeader
              showCaseShelf={false}
              caseCostEditToggle
              caseCostEditing={caseCostEditing}
              onCaseCostEditingChange={(editing) => {
                setCaseCostEditing(editing);
                if (editing) {
                  setCaseCostInput(caseCost > 0 ? caseCost.toFixed(2) : caseCostInput);
                }
              }}
              caseCostInput={caseCostInput}
              onCaseCostInput={(value) => {
                caseCostDirtyRef.current = true;
                setCaseCostInput(value);
                setAnchoredCaseCost(toNumber(value));
              }}
              onResetCaseCost={() => {
                caseCostDirtyRef.current = false;
                setAnchoredCaseCost(catalogCaseCostBaseline);
                setCaseCostInput(
                  catalogCaseCostBaseline > 0 ? catalogCaseCostBaseline.toFixed(2) : ''
                );
              }}
              caseCostOverridden={caseCostOverridden}
              caseCost={caseCost}
              packSize={packSize}
              splitFactor={splitFactor}
              packUnit={packUnit}
              yieldUnit={yieldUnit}
              caseShelfPrice={currentCaseFloor}
              currentRetailPrice={currentRetailPrice}
              marginMode={marginMode}
              customMarginPercent=""
              quote={quote}
              onPackSize={setPackSize}
              onSplitFactor={setSplitFactor}
              onPackUnit={setPackUnit}
              onYieldUnit={setYieldUnit}
              onCaseShelfPrice={onCaseShelfPriceChange}
              onMarginMode={applyMarginMode}
              onCustomMargin={() => {}}
              onRetailFloorPrice={onFloorPriceChange}
              idPrefix="catalog"
            >
              <button
                type="button"
                disabled={busy === 'case' || !(pack > 0) || !(divisor > 0)}
                onClick={() => {
                  const caseCostToSave =
                    caseCost > 0 ? caseCost : toNumber(caseCostInput);
                  setBusy('case');
                  setError(null);
                  void onSaveCase({
                    packSize: pack,
                    splitFactor: divisor,
                    retailUnit: yieldUnit,
                    retailPrice: priceNumber,
                    caseCost: caseCostToSave,
                  })
                    .then(() => {
                      caseCostDirtyRef.current = false;
                      setCatalogCaseCostBaseline(caseCostToSave);
                      setAnchoredCaseCost(caseCostToSave);
                      setCaseCostInput(
                        caseCostToSave > 0 ? caseCostToSave.toFixed(2) : ''
                      );
                      setCaseCostEditing(false);
                      setMessage('Pricing & pack saved.');
                    })
                    .catch((e: Error) => setError(e.message))
                    .finally(() => setBusy(null));
                }}
                className="w-full rounded-xl bg-emerald-400 py-3.5 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50"
              >
                {busy === 'case' ? 'Saving…' : 'Save pricing & pack'}
              </button>
            </PricingYieldCard>
          ) : null}
        </ModalBody>

        {(message || error) && (
          <ModalFooter className="px-6 py-3">
            {message ? <p className="text-sm font-semibold text-emerald-300">{message}</p> : null}
            {error ? <p className="text-sm text-amber-200">{error}</p> : null}
          </ModalFooter>
        )}
    </ModalShell>
  );
}

function toNumber(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}
