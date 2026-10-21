'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search, TriangleAlert } from 'lucide-react';
import { useRole } from '@/components/auth/RoleProvider';
import { isManager } from '@/lib/roles';
import type { StockLevel } from '@/lib/stock';
import {
  calculateYieldQuote,
  formatCurrency,
  formatPercent,
  formatUnits,
  resolveTargetMargin,
  stockUnitLabel,
  type MarginMode,
  type RetailUnit,
  RETAIL_UNITS,
} from '@/lib/yieldPricing';

function casesLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function toNumber(raw: string): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function retailUnitFor(unitType: string): RetailUnit {
  return unitType === 'LBS' ? 'lbs' : 'units';
}

function storedMargin(row: StockLevel): number | null {
  if (row.retailPrice === null || row.retailPrice <= 0) return null;
  return ((row.retailPrice - row.unitCost) / row.retailPrice) * 100;
}

function shelfCue(days: number): { label: string; className: string; warn: boolean } {
  const label = `${days} ${days === 1 ? 'day' : 'days'} left`;
  if (days < 2) return { label, className: 'text-[#C4847A]', warn: true };
  if (days <= 7) return { label, className: 'text-[#C4A574]', warn: true };
  return { label, className: 'text-slate-400', warn: false };
}

const fieldClass =
  'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-[#6E8EAE]';

function StatRow({ label, value, tone }: { label: string; value: string; tone?: 'ocean' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-800/80 py-1.5">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`font-mono text-sm font-bold ${tone === 'ocean' ? 'text-[#7BA3C9]' : 'text-slate-100'}`}>{value}</dd>
    </div>
  );
}

export function SlateInventory({ levels: initialLevels }: { levels: StockLevel[] | null }) {
  const loading = initialLevels === null;
  const [levels, setLevels] = useState<StockLevel[]>(() => initialLevels ?? []);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [packSize, setPackSize] = useState('1');
  const [yieldDivisor, setYieldDivisor] = useState('1');
  const [retailUnit, setRetailUnit] = useState<RetailUnit>('units');
  const [marginMode, setMarginMode] = useState<MarginMode>('40');
  const [customMarginPercent, setCustomMarginPercent] = useState('35');
  const [currentRetailPrice, setCurrentRetailPrice] = useState('0.00');
  const [casesOnHand, setCasesOnHand] = useState('0');
  const [saving, setSaving] = useState(false);
  const [savingStock, setSavingStock] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stockMessage, setStockMessage] = useState<string | null>(null);
  const { activeUser } = useRole();
  const canOverride = activeUser ? isManager(activeUser.role) : false;

  useEffect(() => {
    if (!initialLevels) return;
    setLevels(initialLevels);
  }, [initialLevels]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const catalog = useMemo(
    () => levels.filter((row) => row.onHand > 0).sort((a, b) => a.name.localeCompare(b.name)),
    [levels]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return catalog;
    return catalog.filter(
      (row) => row.name.toLowerCase().includes(needle) || row.supplier.toLowerCase().includes(needle)
    );
  }, [catalog, query]);

  const selected = catalog.find((row) => row.productId === selectedId) ?? catalog[0] ?? null;
  const selectedKey = selected?.productId ?? '';

  useEffect(() => {
    if (!selected) return;
    setPackSize(String(selected.casePackSize));
    setYieldDivisor('1');
    setRetailUnit(retailUnitFor(selected.unitType));
    setMarginMode('40');
    setCurrentRetailPrice(selected.retailPrice !== null ? selected.retailPrice.toFixed(2) : '0.00');
    setCasesOnHand(casesLabel(selected.onHandCases));
    setStockMessage(null);
    setErrorMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const pack = toNumber(packSize);
  const divisor = toNumber(yieldDivisor);
  const priceNumber = toNumber(currentRetailPrice);
  const unitsPerCase = selected && pack > 0 && divisor > 0 ? pack / divisor : selected?.casePackSize ?? 1;
  const caseCost = selected ? selected.unitCost * unitsPerCase : 0;
  const targetMargin = resolveTargetMargin(marginMode, toNumber(customMarginPercent));
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

  const priceForMargin = (mode: MarginMode, custom: string): string | null => {
    const margin = resolveTargetMargin(mode, toNumber(custom));
    const unit = quote.unitCost;
    if (unit === null || !(unit > 0) || margin >= 1) return null;
    return (unit / (1 - margin)).toFixed(2);
  };

  const applyMargin = (mode: MarginMode, custom = customMarginPercent) => {
    setMarginMode(mode);
    const next = priceForMargin(mode, custom);
    if (next) setCurrentRetailPrice(next);
  };

  const saveCase = async () => {
    if (!selected) return;
    setSaving(true);
    setErrorMessage(null);
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
        setErrorMessage(json.error || 'The case could not be saved.');
        return;
      }
      const level = { ...(json.level as StockLevel), daysRemaining: selected.daysRemaining };
      setLevels((current) => current.map((row) => (row.productId === selected.productId ? level : row)));
      setToast(`${selected.name} price saved.`);
    } catch {
      setErrorMessage('The case could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const updateStock = async () => {
    if (!selected || !activeUser || !canOverride) return;
    setSavingStock(true);
    setStockMessage(null);
    setErrorMessage(null);
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
        setErrorMessage(json.error || 'Stock could not be updated.');
        return;
      }
      const level = json.level as StockLevel;
      setLevels((current) => current.map((row) => (row.productId === selected.productId ? level : row)));
      setCasesOnHand(casesLabel(level.onHandCases));
      setStockMessage(`${formatUnits(level.onHand)} ${stockUnitLabel(level.unitType)} on hand.`);
      setToast(`${selected.name} stock updated.`);
    } catch {
      setErrorMessage('Stock could not be updated.');
    } finally {
      setSavingStock(false);
    }
  };

  const marginPct = quote.currentMarginPct;
  const marginHealthy = marginPct !== null && marginPct >= 35;

  const onHandCases = selected && unitsPerCase > 0 ? selected.onHand / unitsPerCase : 0;

  return (
    <section>
      <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 shadow-xl backdrop-blur-md">
          <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-100">Current Inventory</h1>
              <p className="mt-1 text-xs text-slate-400">
                {loading ? 'Reading stored stock…' : `${catalog.length} items in stock`} · Yield, floor price, and the
                receipt stay on screen.
              </p>
            </div>
            <label className="relative block w-full sm:w-64">
              <span className="sr-only">Search item or supplier</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search item or supplier"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-[#6E8EAE]"
              />
            </label>
          </div>
          <div className="flex items-center px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            <span className="flex-1">Name</span>
            <span className="w-44 text-right">Status</span>
          </div>
          {loading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 8 }, (_, index) => (
                <span key={index} className="block h-16 animate-pulse rounded-xl bg-slate-800/80" />
              ))}
            </div>
          ) : (
            <ul className="max-h-[calc(100vh-14rem)] divide-y divide-slate-800 overflow-y-auto">
              {visible.map((row) => {
                const active = selected?.productId === row.productId;
                const margin = storedMargin(row);
                const shelf = shelfCue(row.daysRemaining);
                return (
                  <li
                    key={row.productId}
                    className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 ${
                      active ? 'bg-[#1e293b]' : 'hover:bg-slate-900/70'
                    }`}
                  >
                    <button type="button" onClick={() => setSelectedId(row.productId)} className="min-w-0 text-left">
                      <span className="block truncate text-sm font-bold text-slate-100">{row.name}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-slate-500">{row.supplier}</span>
                      <span className="mt-1 block font-mono text-[11px] text-slate-300">
                        {formatUnits(row.onHand)} {stockUnitLabel(row.unitType)} / {casesLabel(row.onHandCases)} cases
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-400">
                        Margin: {margin === null ? '—' : `${formatPercent(margin)}%`} | Value:{' '}
                        {formatCurrency(row.onHand * row.unitCost)}
                      </span>
                      <span className={`mt-1 flex items-center gap-1 text-[11px] font-bold ${shelf.className}`}>
                        {shelf.warn ? <TriangleAlert className="h-3 w-3" /> : null}
                        {shelf.label}
                      </span>
                    </button>
                    <div className="flex w-44 flex-col items-end gap-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        {active ? (
                          <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-100">
                            Selected
                          </span>
                        ) : null}
                        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                          In stock
                        </span>
                        {row.low ? (
                          <span className="rounded-full bg-[#C4847A]/15 px-2 py-0.5 text-[10px] font-bold text-[#C4847A]">
                            Low
                          </span>
                        ) : null}
                        {shelf.warn ? (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${shelf.className} bg-slate-950/60`}>
                            <TriangleAlert className="h-3 w-3" />
                            {row.daysRemaining}d
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
              {visible.length === 0 ? (
                <li className="px-4 py-10 text-center text-sm text-slate-400">Nothing matches that search.</li>
              ) : null}
            </ul>
          )}
        </div>

        <aside className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 backdrop-blur-md">
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-black text-slate-100">Yield &amp; Price Adjustments</h2>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#C4A574]">2nd priority</p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Pack size
                  <input
                    id="pack-size"
                    type="number"
                    min="0"
                    step="0.01"
                    value={packSize}
                    onChange={(event) => setPackSize(event.target.value)}
                    className={`mt-1 ${fieldClass}`}
                  />
                </label>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Yield divisor
                  <input
                    id="yield-divisor"
                    type="number"
                    min="0"
                    step="0.001"
                    value={yieldDivisor}
                    onChange={(event) => setYieldDivisor(event.target.value)}
                    className={`mt-1 ${fieldClass}`}
                  />
                </label>
              </div>

              <div className="mt-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Target margin</p>
                  <div className="mt-1.5 flex gap-1.5">
                    {(
                      [
                        ['35', '35%'],
                        ['40', '40%'],
                        ['custom', 'Custom'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => applyMargin(id)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                          marginMode === id
                            ? 'bg-slate-200 text-slate-950'
                            : 'border border-slate-700 bg-slate-950 text-slate-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {marginMode === 'custom' ? (
                    <input
                      aria-label="Custom margin percent"
                      type="number"
                      min="0"
                      max="99"
                      step="0.1"
                      value={customMarginPercent}
                      onChange={(event) => {
                        setCustomMarginPercent(event.target.value);
                        const next = priceForMargin('custom', event.target.value);
                        if (next) setCurrentRetailPrice(next);
                      }}
                      className={`mt-2 ${fieldClass}`}
                    />
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Profit margin</p>
                  <p className={`mt-1 font-mono text-sm font-black ${marginHealthy ? 'text-[#7dcec4]' : 'text-[#C4847A]'}`}>
                    {formatPercent(marginPct)}%
                  </p>
                  <p className="mt-1 max-w-[9rem] text-[10px] leading-tight text-slate-500">
                    Current retail price updates this margin
                  </p>
                </div>
              </div>

              <dl className="mt-3">
                <StatRow label="Case cost" value={formatCurrency(caseCost)} />
                <StatRow label="Unit cost" value={formatCurrency(quote.unitCost)} />
                <StatRow
                  label="On hand"
                  value={`${formatUnits(selected.onHand)} ${stockUnitLabel(selected.unitType)}`}
                  tone="ocean"
                />
                <StatRow label="Cases" value={casesLabel(Number(onHandCases.toFixed(2)))} />
                <StatRow label="Target SRP" value={formatCurrency(quote.targetSrp)} />
                <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 py-1.5">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Current retail</dt>
                  <dd className="relative w-28">
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-xs text-slate-400">
                      $
                    </span>
                    <input
                      id="current-retail-price"
                      aria-label="Current retail price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={currentRetailPrice}
                      onChange={(event) => setCurrentRetailPrice(event.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 py-1 pl-5 pr-2 text-right font-mono text-sm font-bold text-slate-100 outline-none focus:border-[#6E8EAE]"
                    />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-1.5">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Retail unit</dt>
                  <dd>
                    <select
                      id="retail-unit"
                      aria-label="Retail unit"
                      value={retailUnit}
                      onChange={(event) => setRetailUnit(event.target.value as RetailUnit)}
                      className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-bold text-slate-100 outline-none focus:border-[#6E8EAE]"
                    >
                      {RETAIL_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </dd>
                </div>
              </dl>

              {errorMessage ? <p className="mt-2 text-sm font-bold text-[#C4847A]">{errorMessage}</p> : null}

              <button
                type="button"
                onClick={() => void saveCase()}
                disabled={saving || !(pack > 0) || !(divisor > 0)}
                className="mt-3 flex w-full items-center justify-center rounded-xl bg-[#3E5C78] px-4 py-2.5 text-sm font-black text-slate-50 hover:bg-[#4E7090] disabled:bg-slate-800 disabled:text-slate-500"
              >
                {saving ? 'Saving…' : 'Save case'}
              </button>

              {canOverride ? (
                <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    Admin Override: Stock Level
                  </p>
                  <label className="mt-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Cases
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={casesOnHand}
                      onChange={(event) => {
                        setCasesOnHand(event.target.value);
                        setStockMessage(null);
                      }}
                      className={`mt-1 ${fieldClass}`}
                    />
                  </label>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Units become cases × {formatUnits(selected.casePackSize)} pack size.
                  </p>
                  {stockMessage ? <p className="mt-2 text-sm font-bold text-[#7dcec4]">{stockMessage}</p> : null}
                  <button
                    type="button"
                    onClick={() => void updateStock()}
                    disabled={savingStock || toNumber(casesOnHand) < 0}
                    className="mt-3 flex w-full items-center justify-center rounded-xl bg-[#3E5C78] px-4 py-2.5 text-sm font-black text-slate-50 hover:bg-[#4E7090] disabled:bg-slate-800 disabled:text-slate-500"
                  >
                    {savingStock ? 'Updating…' : 'Update Stock'}
                  </button>
                </div>
              ) : null}

              <div className={`mt-3 rounded-2xl px-4 py-3 ${marginHealthy ? 'bg-[#163832]' : 'bg-[#C4847A]/15'}`}>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Profit margin</p>
                <p className={`font-mono text-3xl font-black ${marginHealthy ? 'text-[#7dcec4]' : 'text-[#C4847A]'}`}>
                  {formatPercent(marginPct)}%
                </p>
              </div>
            </>
          ) : (
            <p className="py-16 text-center text-sm text-slate-400">
              {loading ? 'Reading stored stock…' : 'Nothing is stored yet.'}
            </p>
          )}
        </aside>
      </div>

      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-slate-700 bg-slate-900/95 px-4 py-3 text-sm font-bold text-slate-100 shadow-xl backdrop-blur md:bottom-8">
          {toast}
        </div>
      ) : null}
    </section>
  );
}
