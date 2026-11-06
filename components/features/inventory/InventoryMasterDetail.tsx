'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useRole } from '@/components/auth/RoleProvider';
import { YieldBreakdown } from '@/components/features/receive/YieldBreakdown';
import { PricingStrategy } from '@/components/features/receive/PricingStrategy';
import {
  SubInventoryTransferBar,
  type PerformInventoryMove,
} from '@/components/features/inventory/SubInventoryTransferBar';
import { stockLevelToTransferRow } from '@/lib/domains/inventory/inventoryMoveClient';
import { Badge, DaysRemainingBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils/cn';
import { fieldMatchesNeedle } from '@/lib/utils/searchNeedle';
import { canOverrideInventoryStock } from '@/lib/auth/staffCapabilities';
import type { StockLevel } from '@/lib/domains/inventory/stock';
import {
  calculateYieldQuote,
  formatCurrency,
  formatPercent,
  formatUnits,
  marginTone,
  resolveTargetMargin,
  stockUnitLabel,
  type MarginMode,
  type RetailUnit,
} from '@/lib/domains/receiving/yieldPricing';

function casesLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function retailUnitFor(unitType: string): RetailUnit {
  return unitType === 'LBS' ? 'lbs' : 'units';
}

function toNumber(raw: string): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function currentMargin(row: StockLevel): number | null {
  if (row.retailPrice === null || row.retailPrice <= 0) return null;
  return ((row.retailPrice - row.unitCost) / row.retailPrice) * 100;
}

function shelfValue(row: StockLevel): number {
  const unit = row.retailPrice !== null && row.retailPrice > 0 ? row.retailPrice : row.unitCost;
  return row.onHand * unit;
}

function dispatchInventoryUpdated() {
  window.dispatchEvent(new CustomEvent('freshloop-inventory-updated'));
}

function suggestedRetailPrice(input: {
  caseCost: number;
  packSize: number;
  splitFactor: number;
  marginMode: MarginMode;
  customMarginPercent: string;
}): string | null {
  const targetMargin = resolveTargetMargin(
    input.marginMode,
    toNumber(input.customMarginPercent)
  );
  const quote = calculateYieldQuote({
    caseCost: input.caseCost,
    packSize: input.packSize,
    splitFactor: input.splitFactor,
    targetMargin,
    currentRetailPrice: 0,
  });
  return quote.targetSrp !== null ? quote.targetSrp.toFixed(2) : null;
}

export function InventoryMasterDetail({
  levels,
  onLevelsChange,
  query,
  departmentFilter,
  onToast,
  onError,
  highlightProductId,
  patchLevelOptimistic,
  performMove,
}: {
  levels: StockLevel[];
  onLevelsChange: (next: StockLevel[]) => void;
  query: string;
  departmentFilter: (row: StockLevel) => boolean;
  onToast: (message: string) => void;
  onError: (message: string) => void;
  highlightProductId?: string | null;
  patchLevelOptimistic?: (
    body: Record<string, unknown>,
    preview: (row: StockLevel) => StockLevel
  ) => Promise<
    { success: true; level: StockLevel } | { success: false; error: string }
  >;
  performMove?: PerformInventoryMove;
}) {
  const { activeUser, loading: roleLoading } = useRole();
  const [roleReady, setRoleReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localQuery, setLocalQuery] = useState('');

  useEffect(() => setRoleReady(true), []);

  const canOverride =
    roleReady &&
    !roleLoading &&
    Boolean(activeUser && canOverrideInventoryStock(activeUser.role));

  const catalog = useMemo(() => {
    const needle = (query || localQuery).trim().toLowerCase();
    return levels
      .filter((row) => row.onHand > 0)
      .filter(departmentFilter)
      .filter((row) => {
        if (!needle) return true;
        return (
          fieldMatchesNeedle(row.name, needle) ||
          fieldMatchesNeedle(row.supplier, needle)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [levels, query, localQuery, departmentFilter]);

  const selected =
    catalog.find((row) => row.productId === selectedId) ?? catalog[0] ?? null;

  const selectedKey = selected?.productId ?? '';

  const [packSize, setPackSize] = useState('1');
  const [splitFactor, setSplitFactor] = useState('1');
  const [packUnit, setPackUnit] = useState<RetailUnit>('units');
  const [yieldUnit, setYieldUnit] = useState<RetailUnit>('units');
  const [marginMode, setMarginMode] = useState<MarginMode>('40');
  const [customMarginPercent, setCustomMarginPercent] = useState('35');
  const [currentRetailPrice, setCurrentRetailPrice] = useState('0.00');
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [casesOnHand, setCasesOnHand] = useState('0');
  const [savingStock, setSavingStock] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);

  useEffect(() => {
    if (catalog.length === 0) return;
    if (highlightProductId && catalog.some((row) => row.productId === highlightProductId)) {
      setSelectedId(highlightProductId);
      window.setTimeout(() => {
        document.getElementById('inventory-row-highlight')?.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      }, 200);
      return;
    }
    setSelectedId((id) => id ?? catalog[0]!.productId);
  }, [catalog, highlightProductId]);

  useEffect(() => {
    if (!selected) return;
    const initialPack = selected.casePackSize;
    setPackSize(String(initialPack));
    setSplitFactor('1');
    const unit = retailUnitFor(selected.unitType);
    setPackUnit(unit);
    setYieldUnit(unit);
    setMarginMode('40');
    const unitsPerCase = initialPack > 0 ? initialPack : 1;
    const initialCaseCost = selected.unitCost * unitsPerCase;
    const suggested = suggestedRetailPrice({
      caseCost: initialCaseCost,
      packSize: initialPack,
      splitFactor: 1,
      marginMode: '40',
      customMarginPercent: '35',
    });
    setCurrentRetailPrice(
      selected.retailPrice !== null
        ? selected.retailPrice.toFixed(2)
        : (suggested ?? '0.00')
    );
    setCasesOnHand(casesLabel(selected.onHandCases));
    setSavedMessage(null);
  }, [selectedKey, selected]);

  const targetMargin = resolveTargetMargin(marginMode, toNumber(customMarginPercent));
  const priceNumber = toNumber(currentRetailPrice);
  const pack = toNumber(packSize);
  const divisor = toNumber(splitFactor);
  const unitsPerCase =
    selected && pack > 0 && divisor > 0 ? pack / divisor : (selected?.casePackSize ?? 1);
  const caseCost = selected ? selected.unitCost * unitsPerCase : 0;

  useEffect(() => {
    if (!selected || marginMode !== 'custom') return;
    const next = suggestedRetailPrice({
      caseCost,
      packSize: pack,
      splitFactor: divisor,
      marginMode,
      customMarginPercent,
    });
    if (next !== null) setCurrentRetailPrice(next);
  }, [customMarginPercent, marginMode, selectedKey, caseCost, pack, divisor, selected]);

  const quote = useMemo(
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

  const tone = marginTone(quote.currentMarginPct);

  const saveCase = async () => {
    if (!selected) return;
    setSaving(true);
    setSavedMessage(null);
    onError('');
    const body = {
      productId: selected.productId,
      packSize: pack,
      splitFactor: divisor,
      retailUnit: yieldUnit,
      retailPrice: priceNumber,
    };
    try {
      if (patchLevelOptimistic) {
        const outcome = await patchLevelOptimistic(body, (row) => ({
          ...row,
          casePackSize: pack,
          retailPrice: priceNumber,
        }));
        if (!outcome.success) {
          onError(outcome.error ?? 'The case could not be saved.');
          return;
        }
        onLevelsChange(
          levels.map((row) =>
            row.productId === selected.productId ? outcome.level! : row
          )
        );
        setSavedMessage('Case updated.');
        onToast('Stock updated — case saved.');
        return;
      }
      const response = await fetch('/api/inventory/levels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        onError(json.error || 'The case could not be saved.');
        return;
      }
      onLevelsChange(
        levels.map((row) => (row.productId === selected.productId ? json.level : row))
      );
      dispatchInventoryUpdated();
      setSavedMessage('Case updated.');
      onToast('Stock updated — case saved.');
    } catch {
      onError('The case could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const updateStock = async () => {
    if (!selected || !activeUser || !canOverride) return;
    setSavingStock(true);
    onError('');
    const cases = toNumber(casesOnHand);
    const body = {
      productId: selected.productId,
      casesOnHand: cases,
    };
    try {
      if (patchLevelOptimistic) {
        const outcome = await patchLevelOptimistic(body, (row) => {
          const pack = row.casePackSize || 1;
          return {
            ...row,
            onHandCases: cases,
            onHand: Number((cases * pack).toFixed(2)),
          };
        });
        if (!outcome.success) {
          onError(outcome.error ?? 'Stock could not be updated.');
          return;
        }
        const level = outcome.level!;
        onLevelsChange(levels.map((row) => (row.productId === selected.productId ? level : row)));
        setCasesOnHand(casesLabel(level.onHandCases));
        onToast(`${formatUnits(level.onHand)} ${stockUnitLabel(level.unitType)} on hand.`);
        return;
      }
      const response = await fetch('/api/inventory/levels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        onError(json.error || 'Stock could not be updated.');
        return;
      }
      const level = json.level as StockLevel;
      onLevelsChange(levels.map((row) => (row.productId === selected.productId ? level : row)));
      setCasesOnHand(casesLabel(level.onHandCases));
      dispatchInventoryUpdated();
      onToast(
        `${formatUnits(level.onHand)} ${stockUnitLabel(level.unitType)} on hand.`
      );
    } catch {
      onError('Stock could not be updated.');
    } finally {
      setSavingStock(false);
    }
  };

  const applyMarginMode = (mode: MarginMode) => {
    setMarginMode(mode);
    setSavedMessage(null);
    const next = suggestedRetailPrice({
      caseCost,
      packSize: pack,
      splitFactor: divisor,
      marginMode: mode,
      customMarginPercent,
    });
    if (next !== null) setCurrentRetailPrice(next);
  };

  if (catalog.length === 0) {
    return (
      <Card>
        <CardBody className="py-12 text-center text-sm text-slate-400">
          No in-stock items match your filters.
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>In stock</CardTitle>
            <CardDescription>
              {catalog.length} SKUs · per-item pull window (2–4d) highlighted
            </CardDescription>
          </div>
          <label className="relative block w-full sm:max-w-[14rem]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <Input
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              placeholder="Filter list…"
              className="py-1.5 pl-9 text-xs"
            />
          </label>
        </CardHeader>
        <div className="sticky top-0 z-10 hidden border-b border-slate-800/80 bg-slate-900/80 px-4 py-2 backdrop-blur-md sm:grid sm:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)_3.5rem_4.5rem_minmax(0,5.5rem)] sm:gap-2 sm:text-[10px] sm:font-bold sm:uppercase sm:tracking-wider sm:text-slate-500">
          <span>Item · supplier</span>
          <span className="text-right">Units / cases</span>
          <span className="text-right">Margin</span>
          <span className="text-right">Value</span>
          <span className="text-right">Expiry</span>
        </div>
        <ul className="max-h-[36rem] divide-y divide-slate-800/80 overflow-y-auto">
          {catalog.map((row) => {
            const active = row.productId === selected?.productId;
            const margin = currentMargin(row);
            const urgent = row.daysRemaining <= row.pullDays || row.low;
            return (
              <li
                key={row.productId}
                id={row.productId === highlightProductId ? 'inventory-row-highlight' : undefined}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(row.productId)}
                  className={cn(
                    'grid w-full grid-cols-1 gap-1.5 px-3 py-2 text-left transition sm:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)_3.5rem_4.5rem_minmax(0,5.5rem)] sm:items-center sm:gap-2 sm:px-4 sm:py-2.5',
                    active
                      ? 'border-l-2 border-l-blue-700 bg-blue-950/20 ring-1 ring-inset ring-blue-800/80'
                      : 'border-l-2 border-l-transparent hover:bg-slate-800/40',
                    urgent && !active && 'bg-rose-950/10',
                    row.productId === highlightProductId && !active && 'bg-blue-950/20 ring-1 ring-inset ring-blue-800/60'
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-100">{row.name}</p>
                    <p className="truncate text-[11px] text-slate-400">{row.supplier || '—'}</p>
                  </div>
                  <p className="font-mono text-[11px] leading-tight text-slate-300 sm:text-right">
                    {formatUnits(row.onHand)} {stockUnitLabel(row.unitType)}
                    <span className="block text-slate-500">{casesLabel(row.onHandCases)} cs</span>
                  </p>
                  <p
                    className={cn(
                      'text-[11px] font-semibold sm:text-right',
                      margin !== null && margin < 35 ? 'text-amber-400/90' : 'text-slate-300'
                    )}
                  >
                    {margin === null ? '—' : `${formatPercent(margin)}%`}
                  </p>
                  <p className="font-mono text-[11px] font-semibold text-slate-100 sm:text-right">
                    {formatCurrency(shelfValue(row))}
                  </p>
                  <div className="flex flex-wrap items-center justify-start gap-1 sm:justify-end">
                    <DaysRemainingBadge days={row.daysRemaining} />
                    {row.low ? <Badge variant="warning">Low</Badge> : null}
                    {row.isMarkdown ? (
                      <Badge variant="ocean">
                        {row.markdownPct ? `${row.markdownPct}% off` : 'Markdown'}
                      </Badge>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="flex flex-col gap-4">
        {selected ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Yield &amp; price adjustments</CardTitle>
                <CardDescription>{selected.name}</CardDescription>
              </CardHeader>
              <CardBody className="space-y-4">
                <YieldBreakdown
                  packSize={packSize}
                  splitFactor={splitFactor}
                  packUnit={packUnit}
                  yieldUnit={yieldUnit}
                  onPackSize={setPackSize}
                  onSplitFactor={setSplitFactor}
                  onPackUnit={setPackUnit}
                  onYieldUnit={setYieldUnit}
                />
                <div className="border-t border-slate-800/80 pt-4">
                  <PricingStrategy
                    quote={quote}
                    marginMode={marginMode}
                    customMarginPercent={customMarginPercent}
                    currentRetailPrice={currentRetailPrice}
                    onMarginMode={applyMarginMode}
                    onCustomMargin={setCustomMarginPercent}
                    onCurrentRetailPrice={setCurrentRetailPrice}
                  />
                </div>
                {quote.targetSrp !== null ? (
                  <p className="text-center text-[11px] text-slate-400">
                    Suggested SRP at target margin:{' '}
                    <span className="font-mono font-bold text-blue-300/90">
                      {formatCurrency(quote.targetSrp)}
                    </span>
                  </p>
                ) : null}
                <p
                  className={cn(
                    'text-center font-mono text-lg font-black',
                    tone === 'healthy'
                      ? 'text-emerald-400/90'
                      : tone === 'thin'
                        ? 'text-amber-400/90'
                        : 'text-slate-400'
                  )}
                >
                  Margin {formatPercent(quote.currentMarginPct)}%
                </p>
                {savedMessage ? (
                  <p className="text-xs font-bold text-emerald-400/90">{savedMessage}</p>
                ) : null}
                <Button
                  variant="success"
                  className="min-h-12 w-full py-3 text-base"
                  disabled={saving || !(pack > 0) || !(divisor > 0)}
                  onClick={() => void saveCase()}
                >
                  {saving ? 'Saving…' : 'Save case'}
                </Button>
              </CardBody>
            </Card>

            {canOverride ? (
              <Card>
                <CardHeader>
                  <CardTitle>Admin override</CardTitle>
                  <CardDescription>Manual case count (managers only)</CardDescription>
                </CardHeader>
                <CardBody className="space-y-3">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Cases on hand
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={casesOnHand}
                      onChange={(e) => setCasesOnHand(e.target.value)}
                      className="mt-1 font-mono"
                    />
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Pack {formatUnits(selected.casePackSize)} · value{' '}
                    {formatCurrency(selected.onHand * selected.unitCost)}
                  </p>
                  <Button
                    variant="secondary"
                    className="min-h-12 w-full"
                    disabled={savingStock}
                    onClick={() => void updateStock()}
                  >
                    {savingStock ? 'Updating…' : 'Update stock'}
                  </Button>
                </CardBody>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Floor moves</CardTitle>
                <CardDescription>Send to production or log waste for this SKU</CardDescription>
              </CardHeader>
              <CardBody>
                <SubInventoryTransferBar
                  row={stockLevelToTransferRow(selected)}
                  staffId={activeUser?.id ?? 'staff-inventory'}
                  variant="floor"
                  performMove={performMove}
                  busy={transferBusy}
                  onBusyChange={(b) => setTransferBusy(b)}
                  onSuccess={({ level, message }) => {
                    onLevelsChange(
                      levels.map((r) => (r.productId === level.productId ? level : r))
                    );
                    onToast(message);
                  }}
                  onError={onError}
                />
              </CardBody>
            </Card>
          </>
        ) : (
          <Card>
            <CardBody className="py-12 text-center text-sm text-slate-400">
              Select an item from the list.
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
