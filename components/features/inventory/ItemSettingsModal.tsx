'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { PricingStrategy } from '@/components/features/receive/PricingStrategy';
import { YieldBreakdown } from '@/components/features/receive/YieldBreakdown';
import type { StockLevel, StockOverrideAudit } from '@/lib/domains/inventory/stock';
import {
  calculateYieldQuote,
  caseFloorForTargetMargin,
  caseFloorFromPerUnitFloor,
  floorPriceForTargetMargin,
  perUnitFloorFromCaseFloor,
  formatFractionalCases,
  formatPercent,
  formatUnits,
  inferMarginModeFromFloorPrice,
  marginTone,
  normalizeStoredUnitFloorPrice,
  resolvePricingEconomics,
  resolveTargetMargin,
  retailUnitForUnitType,
  sellableUnitShortLabel,
  sellableUnitsPerCase,
  stockUnitLabel,
  type MarginMode,
  type RetailUnit,
  type YieldQuote,
} from '@/lib/domains/receiving/yieldPricing';
import { departmentLabel } from '@/lib/domains/inventory/inventoryCatalog';
import { ModalBody, ModalFooter, ModalHeader, ModalShell } from '@/components/ui/layout';
import { cn } from '@/lib/utils/cn';

const DEPARTMENTS = ['PRODUCE', 'DAIRY', 'BAKERY', 'PANTRY', 'DELI_KITCHEN'] as const;

const INPUT =
  'mt-2 w-full rounded-xl border border-slate-700/90 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition focus:border-emerald-500/45 focus:ring-1 focus:ring-emerald-500/20';

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
  }) => Promise<void>;
  onSaveCase: (payload: {
    packSize: number;
    yieldDivisor: number;
    retailUnit: RetailUnit;
    retailPrice: number;
  }) => Promise<void>;
  onUpdatePhysicalCount: (cases: number) => Promise<StockOverrideAudit | null>;
}) {
  const [tab, setTab] = useState<TabId>('overview');
  const [department, setDepartment] = useState('');
  const [supplier, setSupplier] = useState('');
  const [origin, setOrigin] = useState('');
  const [packSize, setPackSize] = useState('1');
  const [yieldDivisor, setYieldDivisor] = useState('1');
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
  const [anchoredCaseCost, setAnchoredCaseCost] = useState(0);
  const [currentCaseFloor, setCurrentCaseFloor] = useState('');

  const syncFloorFromMargin = (
    mode: MarginMode,
    packVal: number,
    divisorVal: number,
    caseCostTotal: number
  ) => {
    if (mode === 'custom') return;
    const next = floorPriceForTargetMargin({
      caseCost: caseCostTotal,
      packSize: packVal,
      yieldDivisor: divisorVal,
      marginMode: mode,
      customMarginPercent: 0,
    });
    if (next !== null && next > 0) setCurrentRetailPrice(next.toFixed(2));
    const caseNext = caseFloorForTargetMargin({ caseCost: caseCostTotal, marginMode: mode });
    if (caseNext !== null && caseNext > 0) setCurrentCaseFloor(caseNext.toFixed(2));
  };

  useEffect(() => {
    if (!open || !row) return;
    skipFloorRecalc.current = true;
    floorFromMargin.current = true;
    setTab('overview');
    setDepartment(row.department);
    setSupplier(row.supplier);
    setOrigin(row.origin ?? '');
    const packVal = row.casePackSize > 0 ? row.casePackSize : 1;
    const divVal = 1;
    setPackSize(String(packVal));
    setYieldDivisor(String(divVal));
    const unit = retailUnitForUnitType(row.unitType);
    setPackUnit(unit);
    setYieldUnit(unit);
    const econ = resolvePricingEconomics({
      standardCost: row.unitCost,
      packSize: packVal,
      yieldDivisor: divVal,
    });
    setAnchoredCaseCost(econ.caseCost);
    const unitFloor =
      normalizeStoredUnitFloorPrice({
        retailPrice: row.retailPrice,
        unitCostPerSellable: econ.unitCostPerSellable,
        packSize: packVal,
        yieldDivisor: divVal,
      }) ?? row.retailPrice;
    const inferred = inferMarginModeFromFloorPrice({
      unitCostPerSellable: row.unitCost,
      retailPrice: unitFloor,
      packSize: packVal,
      yieldDivisor: divVal,
    });
    setMarginMode(inferred);
    if (inferred === 'custom') {
      setCurrentRetailPrice(unitFloor != null && unitFloor > 0 ? unitFloor.toFixed(2) : '0');
      const caseFromUnit = caseFloorFromPerUnitFloor(unitFloor ?? 0, packVal, divVal);
      setCurrentCaseFloor(caseFromUnit !== null && caseFromUnit > 0 ? caseFromUnit.toFixed(2) : '0');
      floorFromMargin.current = false;
    } else {
      syncFloorFromMargin(inferred, packVal, divVal, econ.caseCost);
    }
    setPhysicalCases(String(row.onHandCases));
    setMessage(null);
    setError(null);
    void fetch(`/api/inventory/levels?auditProductId=${encodeURIComponent(row.productId)}`, {
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.audit) setAudit(json.audit as StockOverrideAudit);
        else setAudit(null);
      })
      .catch(() => setAudit(null));
    const t = window.setTimeout(() => {
      skipFloorRecalc.current = false;
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, row]);

  const pack = toNumber(packSize);
  const divisor = toNumber(yieldDivisor);
  const priceNumber = toNumber(currentRetailPrice);
  const sellableCount =
    sellableUnitsPerCase(pack, divisor) ||
    (row && row.casePackSize > 0 ? row.casePackSize : 1);
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
      yieldDivisor: divisor,
    });
  }, [row, pack, divisor, anchoredCaseCost]);
  const { caseCost, unitCostPerSellable } = pricingEconomics;

  const targetMargin =
    marginMode === 'custom' && priceNumber > 0 && unitCostPerSellable > 0
      ? Math.max(0, Math.min(0.99, (priceNumber - unitCostPerSellable) / priceNumber))
      : resolveTargetMargin(marginMode, 0);

  useEffect(() => {
    if (!open || !row || skipFloorRecalc.current || marginMode === 'custom' || !floorFromMargin.current) {
      return;
    }
    syncFloorFromMargin(marginMode, pack, divisor, caseCost);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packSize, yieldDivisor, marginMode, caseCost, open, row?.productId]);

  const quote: YieldQuote = useMemo(
    () =>
      calculateYieldQuote({
        caseCost,
        packSize: pack,
        yieldDivisor: divisor,
        targetMargin,
        currentRetailPrice: priceNumber,
      }),
    [caseCost, pack, divisor, targetMargin, priceNumber]
  );
  const tone = marginTone(quote.currentMarginPct);
  const applyMarginMode = (mode: MarginMode) => {
    floorFromMargin.current = mode !== 'custom';
    setMarginMode(mode);
    if (mode !== 'custom') {
      syncFloorFromMargin(mode, pack, divisor, caseCost);
    }
  };

  const onFloorPriceChange = (value: string) => {
    floorFromMargin.current = false;
    setMarginMode('custom');
    setCurrentRetailPrice(value);
    const caseNext = caseFloorFromPerUnitFloor(toNumber(value), pack, divisor);
    if (caseNext !== null && caseNext > 0) setCurrentCaseFloor(caseNext.toFixed(2));
  };

  const onCaseFloorPriceChange = (value: string) => {
    floorFromMargin.current = false;
    setMarginMode('custom');
    setCurrentCaseFloor(value);
    const perUnit = perUnitFloorFromCaseFloor(toNumber(value), pack, divisor);
    if (perUnit !== null && perUnit > 0) setCurrentRetailPrice(perUnit.toFixed(2));
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
              className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
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
                  'flex-1 rounded-lg py-2.5 text-xs font-black uppercase tracking-wide transition',
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
                      {DEPARTMENTS.map((d) => (
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
                <button
                  type="button"
                  disabled={busy === 'meta'}
                  onClick={() => {
                    setBusy('meta');
                    setError(null);
                    void onSaveMetadata({ department, supplier, origin })
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
                        {formatUnits(systemCases)} cases on hand · par {formatUnits(row.parCases)} cases — consider
                        ordering
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mb-5 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-xs text-slate-400">
                    Stock is at or above par ({formatUnits(row.parCases)} cases).
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
            <div className="space-y-6">
              <SubCard title="Yield & pack" description="Case pack, divisor, and sellable units per case.">
                <YieldBreakdown
                  packSize={packSize}
                  yieldDivisor={yieldDivisor}
                  packUnit={packUnit}
                  yieldUnit={yieldUnit}
                  caseFloorPrice={currentCaseFloor}
                  onCaseFloorPrice={onCaseFloorPriceChange}
                  onPackSize={setPackSize}
                  onYieldDivisor={setYieldDivisor}
                  onPackUnit={setPackUnit}
                  onYieldUnit={setYieldUnit}
                />
              </SubCard>

              <SubCard
                title="Floor price & margin"
                description={`Shelf price is per sellable ${sellableUnitShortLabel(yieldUnit)} (yield divisor unit). The catalog shows case price (× pack ÷ yield).`}
              >
                <PricingStrategy
                  quote={quote}
                  marginMode={marginMode}
                  customMarginPercent=""
                  currentRetailPrice={currentRetailPrice}
                  floorPriceFromMargin
                  floorPriceUnitLabel={sellableUnitShortLabel(yieldUnit)}
                  onMarginMode={applyMarginMode}
                  onCustomMargin={() => {}}
                  onCurrentRetailPrice={onFloorPriceChange}
                />
                {unitCostPerSellable > 0 ? (
                  <p className="mt-4 text-xs text-slate-500">
                    Unit cost{' '}
                    <span className="font-mono font-semibold text-slate-300">
                      ${unitCostPerSellable.toFixed(2)}
                    </span>{' '}
                    / {sellableUnitShortLabel(yieldUnit)} · case cost{' '}
                    <span className="font-mono font-semibold text-slate-300">${caseCost.toFixed(2)}</span>
                  </p>
                ) : null}
                <div className="mt-6 flex items-end justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/70 px-5 py-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Margin at floor price (per {sellableUnitShortLabel(yieldUnit)})
                    </p>
                    <p
                      className={cn(
                        'mt-1 font-mono text-3xl font-black tabular-nums',
                        tone === 'healthy' ? 'text-emerald-300' : tone === 'thin' ? 'text-amber-300' : 'text-slate-400'
                      )}
                    >
                      {formatPercent(quote.currentMarginPct)}%
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy === 'case' || !(pack > 0) || !(divisor > 0)}
                  onClick={() => {
                    setBusy('case');
                    setError(null);
                    void onSaveCase({
                      packSize: pack,
                      yieldDivisor: divisor,
                      retailUnit: yieldUnit,
                      retailPrice: priceNumber,
                    })
                      .then(() => setMessage('Pricing & pack saved.'))
                      .catch((e: Error) => setError(e.message))
                      .finally(() => setBusy(null));
                  }}
                  className="mt-6 w-full rounded-xl bg-emerald-400 py-3.5 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50"
                >
                  {busy === 'case' ? 'Saving…' : 'Save pricing & pack'}
                </button>
              </SubCard>
            </div>
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
