'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useRole } from '@/components/auth/RoleProvider';
import { YieldBreakdown } from '@/components/features/receive/YieldBreakdown';
import { PricingStrategy } from '@/components/features/receive/PricingStrategy';
import { SubInventoryTransferBar } from '@/components/features/inventory/SubInventoryTransferBar';
import { stockLevelToTransferRow } from '@/lib/domains/inventory/inventoryMoveClient';
import { Badge, DaysRemainingBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils/cn';
import { isManager } from '@/lib/utils/roles';
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

export function InventoryMasterDetail({
  levels,
  onLevelsChange,
  pullDays,
  query,
  departmentFilter,
  onToast,
  onError,
}: {
  levels: StockLevel[];
  onLevelsChange: (next: StockLevel[]) => void;
  pullDays: number;
  query: string;
  departmentFilter: (row: StockLevel) => boolean;
  onToast: (message: string) => void;
  onError: (message: string) => void;
}) {
  const { activeUser, loading: roleLoading } = useRole();
  const [roleReady, setRoleReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localQuery, setLocalQuery] = useState('');

  useEffect(() => setRoleReady(true), []);

  const canOverride =
    roleReady && !roleLoading && Boolean(activeUser && isManager(activeUser.role));

  const catalog = useMemo(() => {
    const needle = (query || localQuery).trim().toLowerCase();
    return levels
      .filter((row) => row.onHand > 0)
      .filter(departmentFilter)
      .filter((row) => {
        if (!needle) return true;
        return (
          row.name.toLowerCase().includes(needle) ||
          row.supplier.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [levels, query, localQuery, departmentFilter]);

  const selected =
    catalog.find((row) => row.productId === selectedId) ?? catalog[0] ?? null;

  const selectedKey = selected?.productId ?? '';

  const [packSize, setPackSize] = useState('1');
  const [yieldDivisor, setYieldDivisor] = useState('1');
  const [retailUnit, setRetailUnit] = useState<RetailUnit>('units');
  const [marginMode, setMarginMode] = useState<MarginMode>('40');
  const [customMarginPercent, setCustomMarginPercent] = useState('35');
  const [currentRetailPrice, setCurrentRetailPrice] = useState('0.00');
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [casesOnHand, setCasesOnHand] = useState('0');
  const [savingStock, setSavingStock] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setPackSize(String(selected.casePackSize));
    setYieldDivisor('1');
    setRetailUnit(retailUnitFor(selected.unitType));
    setMarginMode('40');
    setCurrentRetailPrice(
      selected.retailPrice !== null ? selected.retailPrice.toFixed(2) : '0.00'
    );
    setCasesOnHand(casesLabel(selected.onHandCases));
    setSavedMessage(null);
  }, [selectedKey, selected]);

  const targetMargin = resolveTargetMargin(marginMode, toNumber(customMarginPercent));
  const priceNumber = toNumber(currentRetailPrice);
  const pack = toNumber(packSize);
  const divisor = toNumber(yieldDivisor);
  const unitsPerCase =
    selected && pack > 0 && divisor > 0 ? pack / divisor : (selected?.casePackSize ?? 1);
  const caseCost = selected ? selected.unitCost * unitsPerCase : 0;

  const quote = useMemo(
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

  const saveCase = async () => {
    if (!selected) return;
    setSaving(true);
    setSavedMessage(null);
    onError('');
    try {
      const response = await fetch('/api/inventory/levels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selected.productId,
          packSize: pack,
          yieldDivisor: divisor,
          retailUnit,
          retailPrice: priceNumber,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        onError(json.error || 'The case could not be saved.');
        return;
      }
      onLevelsChange(
        levels.map((row) => (row.productId === selected.productId ? json.level : row))
      );
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
    try {
      const response = await fetch('/api/inventory/levels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selected.productId,
          casesOnHand: toNumber(casesOnHand),
          role: activeUser.role,
          staffId: activeUser.id,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        onError(json.error || 'Stock could not be updated.');
        return;
      }
      const level = json.level as StockLevel;
      onLevelsChange(levels.map((row) => (row.productId === selected.productId ? level : row)));
      setCasesOnHand(casesLabel(level.onHandCases));
      onToast(
        `${formatUnits(level.onHand)} ${stockUnitLabel(level.unitType)} on hand.`
      );
    } catch {
      onError('Stock could not be updated.');
    } finally {
      setSavingStock(false);
    }
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
            <CardDescription>{catalog.length} SKUs · pull window ≤ {pullDays}d highlighted</CardDescription>
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
        <ul className="max-h-[36rem] divide-y divide-slate-800/80 overflow-y-auto">
          {catalog.map((row) => {
            const active = row.productId === selected?.productId;
            const margin = currentMargin(row);
            const urgent = row.daysRemaining <= pullDays || row.low;
            return (
              <li key={row.productId}>
                <button
                  type="button"
                  onClick={() => setSelectedId(row.productId)}
                  className={cn(
                    'grid w-full grid-cols-1 gap-1 px-3 py-2.5 text-left transition sm:grid-cols-[minmax(0,1.4fr)_auto_auto_auto] sm:items-center sm:gap-3 sm:px-4',
                    active
                      ? 'bg-blue-950/10 ring-1 ring-inset ring-blue-800'
                      : 'hover:bg-slate-800/40',
                    urgent && !active && 'bg-rose-950/10'
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-100">{row.name}</p>
                    <p className="truncate text-[11px] text-slate-500">{row.supplier}</p>
                  </div>
                  <p className="font-mono text-[11px] text-slate-300 sm:text-right">
                    {formatUnits(row.onHand)} {stockUnitLabel(row.unitType)}
                    <span className="text-slate-500"> · </span>
                    {casesLabel(row.onHandCases)} cs
                  </p>
                  <p className="text-[11px] text-slate-400 sm:text-right">
                    {margin === null ? '—' : `${formatPercent(margin)}%`}
                  </p>
                  <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                    <DaysRemainingBadge days={row.daysRemaining} />
                    {row.low ? <Badge variant="warning">Low</Badge> : null}
                    {row.isMarkdown ? <Badge variant="ocean">30% off</Badge> : null}
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
                  yieldDivisor={yieldDivisor}
                  retailUnit={retailUnit}
                  onPackSize={setPackSize}
                  onYieldDivisor={setYieldDivisor}
                  onRetailUnit={setRetailUnit}
                />
                <div className="border-t border-slate-800/80 pt-4">
                  <PricingStrategy
                    quote={quote}
                    marginMode={marginMode}
                    customMarginPercent={customMarginPercent}
                    currentRetailPrice={currentRetailPrice}
                    onMarginMode={setMarginMode}
                    onCustomMargin={setCustomMarginPercent}
                    onCurrentRetailPrice={setCurrentRetailPrice}
                  />
                </div>
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
                  className="w-full py-3 text-base"
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
                    className="w-full"
                    disabled={savingStock}
                    onClick={() => void updateStock()}
                  >
                    {savingStock ? 'Updating…' : 'Update stock level'}
                  </Button>
                </CardBody>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Floor moves</CardTitle>
                <CardDescription>Rescue, markdown, or waste for this SKU</CardDescription>
              </CardHeader>
              <CardBody>
                <SubInventoryTransferBar
                  row={stockLevelToTransferRow(selected)}
                  staffId={activeUser?.id ?? 'staff-inventory'}
                  variant="floor"
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
