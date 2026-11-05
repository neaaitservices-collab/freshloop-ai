"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useRole } from "@/components/auth/RoleProvider";
import { PageIntro } from "@/components/layout/PageIntro";
import { canOverrideInventoryStock } from '@/lib/auth/staffCapabilities';
import { PricingStrategy } from "@/components/features/receive/PricingStrategy";
import { YieldBreakdown } from "@/components/features/receive/YieldBreakdown";
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
  type YieldQuote,
} from "@/lib/domains/receiving/yieldPricing";
import type { StockLevel } from "@/lib/domains/inventory/stock";
import { fieldMatchesNeedle } from "@/lib/utils/searchNeedle";
import { AdminInventoryWorkspace } from "@/components/features/inventory/AdminInventoryWorkspace";

function casesLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function retailUnitFor(unitType: string): RetailUnit {
  return unitType === "LBS" ? "lbs" : "units";
}

function toNumber(raw: string): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function shelfTone(days: number): { dot: string; text: string } {
  if (days < 2) return { dot: "bg-[#C4847A]", text: "text-[#C4847A]" };
  if (days < 4) return { dot: "bg-[#C4A574]", text: "text-[#C4A574]" };
  if (days > 7) return { dot: "bg-[#7F9A78]", text: "text-[#7F9A78]" };
  return { dot: "bg-slate-500", text: "text-slate-400" };
}

function currentMargin(row: StockLevel): number | null {
  if (row.retailPrice === null || row.retailPrice <= 0) return null;
  return ((row.retailPrice - row.unitCost) / row.retailPrice) * 100;
}

export function CaseBoard({
  levels: initialLevels,
  showIntro = false,
  showReceipt = false,
  focused = false,
}: {
  levels: StockLevel[] | null;
  showIntro?: boolean;
  showReceipt?: boolean;
  focused?: boolean;
}) {
  const loading = initialLevels === null;
  const [levels, setLevels] = useState<StockLevel[]>(() => initialLevels ?? []);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const catalog = useMemo(
    () =>
      levels
        .filter((row) => row.onHand > 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [levels],
  );

  const stored = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return catalog;
    return catalog.filter(
      (row) =>
        fieldMatchesNeedle(row.name, needle) ||
        fieldMatchesNeedle(row.supplier, needle),
    );
  }, [catalog, query]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return catalog
      .filter(
        (row) =>
          fieldMatchesNeedle(row.name, needle) ||
          fieldMatchesNeedle(row.supplier, needle),
      )
      .slice(0, 8);
  }, [catalog, query]);

  const selected = focused
    ? (catalog.find((row) => row.productId === selectedId) ?? null)
    : (stored.find((row) => row.productId === selectedId) ?? stored[0] ?? null);

  const selectedKey = selected?.productId ?? "";
  const [packSize, setPackSize] = useState(() =>
    selected ? String(selected.casePackSize) : "1",
  );
  const [yieldDivisor, setYieldDivisor] = useState("1");
  const [packUnit, setPackUnit] = useState<RetailUnit>(() =>
    selected ? retailUnitFor(selected.unitType) : "units",
  );
  const [yieldUnit, setYieldUnit] = useState<RetailUnit>(() =>
    selected ? retailUnitFor(selected.unitType) : "units",
  );
  const [marginMode, setMarginMode] = useState<MarginMode>("40");
  const [customMarginPercent, setCustomMarginPercent] = useState("35");
  const [currentRetailPrice, setCurrentRetailPrice] = useState(() =>
    selected && selected.retailPrice !== null
      ? selected.retailPrice.toFixed(2)
      : "0.00",
  );
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [casesOnHand, setCasesOnHand] = useState(() =>
    selected ? casesLabel(selected.onHandCases) : "0",
  );
  const [savingStock, setSavingStock] = useState(false);
  const [stockMessage, setStockMessage] = useState<string | null>(null);
  const { activeUser, loading: roleLoading } = useRole();
  const [roleReady, setRoleReady] = useState(false);
  useEffect(() => {
    setRoleReady(true);
  }, []);
  const canOverride =
    roleReady &&
    !roleLoading &&
    Boolean(activeUser && canOverrideInventoryStock(activeUser.role));

  useEffect(() => {
    if (!initialLevels) return;
    setLevels(initialLevels);
  }, [initialLevels]);

  useEffect(() => {
    if (!selected) return;
    setPackSize(String(selected.casePackSize));
    setYieldDivisor("1");
    const unit = retailUnitFor(selected.unitType);
    setPackUnit(unit);
    setYieldUnit(unit);
    setMarginMode("40");
    setCurrentRetailPrice(
      selected.retailPrice !== null ? selected.retailPrice.toFixed(2) : "0.00",
    );
    setCasesOnHand(casesLabel(selected.onHandCases));
    setStockMessage(null);
    setSavedMessage(null);
    setErrorMessage(null);
    // Seed the editor only when the chosen item changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  const targetMargin = resolveTargetMargin(
    marginMode,
    toNumber(customMarginPercent),
  );
  const priceNumber = toNumber(currentRetailPrice);
  const pack = toNumber(packSize);
  const divisor = toNumber(yieldDivisor);
  const unitsPerCase =
    selected && pack > 0 && divisor > 0
      ? pack / divisor
      : (selected?.casePackSize ?? 1);
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
    [caseCost, pack, divisor, targetMargin, priceNumber],
  );
  const tone = marginTone(quote.currentMarginPct);
  const onHandCases =
    selected && unitsPerCase > 0 ? selected.onHand / unitsPerCase : 0;

  const saveCase = async () => {
    if (!selected) return;
    setSaving(true);
    setSavedMessage(null);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/inventory/levels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selected.productId,
          packSize: pack,
          yieldDivisor: divisor,
          retailUnit: yieldUnit,
          retailPrice: priceNumber,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setErrorMessage(json.error || "The case could not be saved.");
        return;
      }
      setLevels((current) =>
        current.map((row) =>
          row.productId === selected.productId ? json.level : row,
        ),
      );
      setSavedMessage("Case updated.");
    } catch {
      setErrorMessage("The case could not be saved.");
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
      const response = await fetch("/api/inventory/levels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selected.productId,
          casesOnHand: toNumber(casesOnHand),
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setErrorMessage(json.error || "Stock could not be updated.");
        return;
      }
      const level = json.level as StockLevel;
      setLevels((current) =>
        current.map((row) =>
          row.productId === selected.productId ? level : row,
        ),
      );
      setCasesOnHand(casesLabel(level.onHandCases));
      setStockMessage(
        `${formatUnits(level.onHand)} ${stockUnitLabel(level.unitType)} on hand.`,
      );
    } catch {
      setErrorMessage("Stock could not be updated.");
    } finally {
      setSavingStock(false);
    }
  };

  return (
    <section className={showIntro ? "" : "mt-8"}>
      {showIntro ? (
        <PageIntro
          step="Inventory"
          title="What is in stock"
          description="Pick a case from the list. Yield, floor price, and the receipt stay on screen. Saving does not receive more product."
        />
      ) : showReceipt ? null : (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">
            Inventory
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-white">
            Edit a case
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            The receipt is the on-hand count. Change the pack, the yield, or the
            shelf price. Saving does not receive more product.
          </p>
        </div>
      )}

      {focused ? (
        <FocusedEditor
          loading={loading}
          query={query}
          matches={matches}
          selected={selected}
          onQuery={setQuery}
          onPick={(productId) => {
            setSelectedId(productId);
            setQuery("");
          }}
          editor={
            selected ? (
              <EditorPanel
                packSize={packSize}
                yieldDivisor={yieldDivisor}
                packUnit={packUnit}
                yieldUnit={yieldUnit}
                quote={quote}
                marginMode={marginMode}
                customMarginPercent={customMarginPercent}
                currentRetailPrice={currentRetailPrice}
                savedMessage={savedMessage}
                errorMessage={errorMessage}
                saving={saving}
                canSave={pack > 0 && divisor > 0}
                onPackSize={(value) => {
                  setPackSize(value);
                  setSavedMessage(null);
                }}
                onYieldDivisor={(value) => {
                  setYieldDivisor(value);
                  setSavedMessage(null);
                }}
                onPackUnit={(value) => {
                  setPackUnit(value);
                  setSavedMessage(null);
                }}
                onYieldUnit={(value) => {
                  setYieldUnit(value);
                  setSavedMessage(null);
                }}
                onMarginMode={setMarginMode}
                onCustomMargin={setCustomMarginPercent}
                onCurrentRetailPrice={(value) => {
                  setCurrentRetailPrice(value);
                  setSavedMessage(null);
                }}
                onSave={() => void saveCase()}
              />
            ) : null
          }
          receipt={
            selected ? (
              <ReceiptPanel
                name={selected.name}
                supplier={selected.supplier}
                retailUnit={yieldUnit}
                unitsPerCase={quote.totalRetailUnits}
                caseCost={caseCost}
                unitCost={quote.unitCost}
                onHand={selected.onHand}
                unitType={selected.unitType}
                cases={onHandCases}
                targetSrp={quote.targetSrp}
                currentRetail={priceNumber}
                marginPct={quote.currentMarginPct}
                tone={tone}
                canOverride={canOverride}
                casesOnHand={casesOnHand}
                packSize={selected.casePackSize}
                stockMessage={stockMessage}
                savingStock={savingStock}
                onCases={(value) => {
                  setCasesOnHand(value);
                  setStockMessage(null);
                }}
                onUpdate={() => void updateStock()}
              />
            ) : null
          }
        />
      ) : null}

      {focused ? null : showReceipt ? (
        <div className="mt-4">
          <AdminInventoryWorkspace levels={initialLevels} />
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-zinc-300">
              {loading
                ? "Reading stored stock…"
                : `${stored.length} ${stored.length === 1 ? "item" : "items"} in stock`}
            </p>
            <label className="relative block w-full sm:w-72">
              <span className="sr-only">Search stored inventory</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search item or supplier"
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-emerald-400/70"
              />
            </label>
          </div>

          {loading ? (
            <div className="mt-4 space-y-2 rounded-3xl border border-zinc-800 bg-zinc-900/70 p-3">
              {Array.from({ length: 6 }, (_, index) => (
                <span
                  key={index}
                  className="block h-8 animate-pulse rounded-xl bg-zinc-800"
                />
              ))}
            </div>
          ) : null}

          {!loading && !selected ? (
            <p className="mt-4 rounded-3xl border border-zinc-800 bg-zinc-900 px-4 py-10 text-center text-sm text-zinc-300">
              {query
                ? "Nothing stored matches that search."
                : "Nothing is stored yet. Save a case on Receive."}
            </p>
          ) : null}

          {selected ? (
            <div
              className={`mt-4 grid items-start gap-4 ${
                showReceipt
                  ? "xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)_300px]"
                  : "lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]"
              }`}
            >
              <nav className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-md">
                <p className="border-b border-slate-800 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  In stock
                </p>
                <ul className="max-h-[32rem] divide-y divide-slate-800 overflow-y-auto">
                  {stored.map((row) => {
                    const active = row.productId === selected.productId;
                    const margin = currentMargin(row);
                    const shelf = shelfTone(row.daysRemaining);
                    const unit = stockUnitLabel(row.unitType);
                    return (
                      <li key={row.productId}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(row.productId)}
                          className={`block w-full px-4 py-3 text-left ${
                            active
                              ? "bg-slate-800 text-slate-50"
                              : "text-slate-200 hover:bg-slate-800/60"
                          }`}
                        >
                          <span className="block text-sm font-black leading-snug">
                            {row.name}
                          </span>
                          <span
                            className={`mt-0.5 block text-[11px] font-semibold ${active ? "text-slate-300" : "text-slate-500"}`}
                          >
                            {row.supplier}
                          </span>
                          <span className="mt-1.5 block font-mono text-[11px] text-slate-300">
                            {formatUnits(row.onHand)} {unit} /{" "}
                            {casesLabel(row.onHandCases)} cases
                          </span>
                          <span className="mt-0.5 block text-[11px] text-slate-400">
                            Margin:{" "}
                            {margin === null
                              ? "—"
                              : `${formatPercent(margin)}%`}{" "}
                            | Value: {formatCurrency(row.onHand * row.unitCost)}
                          </span>
                          <span
                            className={`mt-1.5 flex items-center gap-1.5 text-[11px] font-bold ${shelf.text}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${shelf.dot}`}
                            />
                            {row.daysRemaining}{" "}
                            {row.daysRemaining === 1 ? "day" : "days"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              <div className="space-y-5 rounded-3xl border border-zinc-800 bg-zinc-900/80 p-4 sm:p-5">
                <YieldBreakdown
                  packSize={packSize}
                  yieldDivisor={yieldDivisor}
                  packUnit={packUnit}
                  yieldUnit={yieldUnit}
                  onPackSize={(value) => {
                    setPackSize(value);
                    setSavedMessage(null);
                  }}
                  onYieldDivisor={(value) => {
                    setYieldDivisor(value);
                    setSavedMessage(null);
                  }}
                  onPackUnit={(value) => {
                    setPackUnit(value);
                    setSavedMessage(null);
                  }}
                  onYieldUnit={(value) => {
                    setYieldUnit(value);
                    setSavedMessage(null);
                  }}
                />
                <div className="border-t border-zinc-800" />
                <PricingStrategy
                  quote={quote}
                  marginMode={marginMode}
                  customMarginPercent={customMarginPercent}
                  currentRetailPrice={currentRetailPrice}
                  onMarginMode={setMarginMode}
                  onCustomMargin={setCustomMarginPercent}
                  onCurrentRetailPrice={(value) => {
                    setCurrentRetailPrice(value);
                    setSavedMessage(null);
                  }}
                />
                {savedMessage ? (
                  <p className="text-sm font-bold text-emerald-300">
                    {savedMessage}
                  </p>
                ) : null}
                {errorMessage ? (
                  <p className="text-sm font-bold text-orange-300">
                    {errorMessage}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void saveCase()}
                  disabled={saving || !(pack > 0) || !(divisor > 0)}
                  className="flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                >
                  {saving ? "Saving…" : "Save case"}
                </button>
                {canOverride && !showReceipt ? (
                  <StockOverride
                    casesOnHand={casesOnHand}
                    packSize={selected.casePackSize}
                    stockMessage={stockMessage}
                    savingStock={savingStock}
                    onCases={(value) => {
                      setCasesOnHand(value);
                      setStockMessage(null);
                    }}
                    onUpdate={() => void updateStock()}
                  />
                ) : null}
              </div>

              {showReceipt ? (
                <aside className="overflow-hidden rounded-3xl border border-emerald-500/25 bg-zinc-900/90">
                  <div className="border-b border-zinc-800 px-5 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300/80">
                      Receipt confirmation
                    </p>
                    <h3 className="mt-1 text-lg font-black leading-tight text-white">
                      {selected.name}
                    </h3>
                    <p className="mt-1 text-sm text-zinc-300">
                      1 case = {formatUnits(quote.totalRetailUnits)}{" "}
                      {yieldUnit}
                    </p>
                    <p className="text-xs text-zinc-500">{selected.supplier}</p>
                  </div>
                  <dl className="px-5 py-2">
                    <ReceiptRow
                      label="Case cost"
                      value={formatCurrency(caseCost)}
                    />
                    <ReceiptRow
                      label="Unit cost"
                      value={formatCurrency(quote.unitCost)}
                    />
                    <ReceiptRow
                      label="On hand"
                      value={`${formatUnits(selected.onHand)} ${stockUnitLabel(selected.unitType)}`}
                      emphasis
                    />
                    <ReceiptRow
                      label="Cases"
                      value={casesLabel(Number(onHandCases.toFixed(2)))}
                    />
                    <ReceiptRow
                      label="Target SRP"
                      value={formatCurrency(quote.targetSrp)}
                    />
                    <ReceiptRow
                      label="Current retail"
                      value={formatCurrency(priceNumber)}
                    />
                  </dl>
                  {canOverride ? (
                    <div className="mx-5 mb-5">
                      <StockOverride
                        casesOnHand={casesOnHand}
                        packSize={selected.casePackSize}
                        stockMessage={stockMessage}
                        savingStock={savingStock}
                        onCases={(value) => {
                          setCasesOnHand(value);
                          setStockMessage(null);
                        }}
                        onUpdate={() => void updateStock()}
                      />
                    </div>
                  ) : null}
                  <div
                    className={`mx-5 mb-5 rounded-2xl px-4 py-3 ${tone === "thin" ? "bg-orange-500/10" : "bg-emerald-500/10"}`}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      Profit margin
                    </p>
                    <p
                      className={`font-mono text-2xl font-black ${
                        tone === "healthy"
                          ? "text-emerald-300"
                          : tone === "thin"
                            ? "text-orange-300"
                            : "text-zinc-400"
                      }`}
                    >
                      {formatPercent(quote.currentMarginPct)}%
                    </p>
                  </div>
                </aside>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/* Legacy inline editor retained for non-admin CaseBoard routes (showReceipt=false). */

function StockOverride({
  casesOnHand,
  packSize,
  stockMessage,
  savingStock,
  onCases,
  onUpdate,
}: {
  casesOnHand: string;
  packSize: number;
  stockMessage: string | null;
  savingStock: boolean;
  onCases: (value: string) => void;
  onUpdate: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6E8EAE]">
        Admin Override: Stock Level
      </p>
      <label className="mt-3 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
        Cases
        <input
          type="number"
          min="0"
          step="0.01"
          value={casesOnHand}
          onChange={(event) => onCases(event.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-50 outline-none focus:border-[#6E8EAE]"
        />
      </label>
      <p className="mt-2 text-[11px] text-slate-500">
        Units become cases × {formatUnits(packSize)} pack size.
      </p>
      {stockMessage ? (
        <p className="mt-2 text-sm font-bold text-[#7F9A78]">{stockMessage}</p>
      ) : null}
      <button
        type="button"
        onClick={onUpdate}
        disabled={savingStock || toNumber(casesOnHand) < 0}
        className="mt-3 flex w-full items-center justify-center rounded-xl bg-[#3E5C78] px-4 py-2.5 text-sm font-black text-slate-50 transition hover:bg-[#4E7090] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
      >
        {savingStock ? "Updating…" : "Update Stock"}
      </button>
    </div>
  );
}

function ReceiptRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-zinc-800/80 py-2.5 last:border-0">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
        {label}
      </dt>
      <dd
        className={`text-right font-mono text-sm ${emphasis ? "text-base font-black text-emerald-300" : "font-bold text-white"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function ItemSearch({
  query,
  matches,
  onQuery,
  onPick,
}: {
  query: string;
  matches: StockLevel[];
  onQuery: (value: string) => void;
  onPick: (productId: string) => void;
}) {
  return (
    <div className="relative">
      <label className="relative block">
        <span className="sr-only">Search item or supplier</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && matches[0]) {
              event.preventDefault();
              onPick(matches[0].productId);
            }
          }}
          placeholder="Search item or supplier"
          className="w-full rounded-2xl border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-slate-50 outline-none focus:border-[#6E8EAE]"
        />
      </label>
      {matches.length > 0 ? (
        <ul className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/95 shadow-xl backdrop-blur-md">
          {matches.map((row) => (
            <li
              key={row.productId}
              className="border-b border-slate-800 last:border-0"
            >
              <button
                type="button"
                onClick={() => onPick(row.productId)}
                className="block w-full px-4 py-3 text-left hover:bg-slate-800"
              >
                <span className="block text-sm font-black text-slate-50">
                  {row.name}
                </span>
                <span className="mt-0.5 block text-[11px] font-semibold text-slate-400">
                  {row.supplier}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim() ? (
        <p className="mt-2 text-xs text-slate-400">
          No items match that search.
        </p>
      ) : null}
    </div>
  );
}

function FocusedEditor({
  loading,
  query,
  matches,
  selected,
  onQuery,
  onPick,
  editor,
  receipt,
}: {
  loading: boolean;
  query: string;
  matches: StockLevel[];
  selected: StockLevel | null;
  onQuery: (value: string) => void;
  onPick: (productId: string) => void;
  editor: React.ReactNode;
  receipt: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="mt-8 h-40 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50" />
    );
  }

  if (!selected) {
    return (
      <div className="mt-16 flex flex-col items-center px-4 text-center">
        <Search className="h-12 w-12 text-slate-400" strokeWidth={1.25} />
        <p className="mt-4 max-w-sm text-sm text-slate-400">
          Search for an item or supplier to edit stock and pricing
        </p>
        <div className="mt-6 w-full max-w-md text-left">
          <ItemSearch
            query={query}
            matches={matches}
            onQuery={onQuery}
            onPick={onPick}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
      {editor}
      <div className="space-y-4">
        <ItemSearch
          query={query}
          matches={matches}
          onQuery={onQuery}
          onPick={onPick}
        />
        {receipt}
      </div>
    </div>
  );
}

function EditorPanel({
  packSize,
  yieldDivisor,
  packUnit,
  yieldUnit,
  quote,
  marginMode,
  customMarginPercent,
  currentRetailPrice,
  savedMessage,
  errorMessage,
  saving,
  canSave,
  onPackSize,
  onYieldDivisor,
  onPackUnit,
  onYieldUnit,
  onMarginMode,
  onCustomMargin,
  onCurrentRetailPrice,
  onSave,
}: {
  packSize: string;
  yieldDivisor: string;
  packUnit: RetailUnit;
  yieldUnit: RetailUnit;
  quote: YieldQuote;
  marginMode: MarginMode;
  customMarginPercent: string;
  currentRetailPrice: string;
  savedMessage: string | null;
  errorMessage: string | null;
  saving: boolean;
  canSave: boolean;
  onPackSize: (value: string) => void;
  onYieldDivisor: (value: string) => void;
  onPackUnit: (value: RetailUnit) => void;
  onYieldUnit: (value: RetailUnit) => void;
  onMarginMode: (value: MarginMode) => void;
  onCustomMargin: (value: string) => void;
  onCurrentRetailPrice: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-5 rounded-3xl border border-zinc-800 bg-zinc-900/80 p-4 sm:p-5">
      <YieldBreakdown
        packSize={packSize}
        yieldDivisor={yieldDivisor}
        packUnit={packUnit}
        yieldUnit={yieldUnit}
        onPackSize={onPackSize}
        onYieldDivisor={onYieldDivisor}
        onPackUnit={onPackUnit}
        onYieldUnit={onYieldUnit}
      />
      <div className="border-t border-zinc-800" />
      <PricingStrategy
        quote={quote}
        marginMode={marginMode}
        customMarginPercent={customMarginPercent}
        currentRetailPrice={currentRetailPrice}
        onMarginMode={onMarginMode}
        onCustomMargin={onCustomMargin}
        onCurrentRetailPrice={onCurrentRetailPrice}
      />
      {savedMessage ? (
        <p className="text-sm font-bold text-emerald-300">{savedMessage}</p>
      ) : null}
      {errorMessage ? (
        <p className="text-sm font-bold text-orange-300">{errorMessage}</p>
      ) : null}
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !canSave}
        className="flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
      >
        {saving ? "Saving…" : "Save case"}
      </button>
    </div>
  );
}

function ReceiptPanel({
  name,
  supplier,
  retailUnit,
  unitsPerCase,
  caseCost,
  unitCost,
  onHand,
  unitType,
  cases,
  targetSrp,
  currentRetail,
  marginPct,
  tone,
  canOverride,
  casesOnHand,
  packSize,
  stockMessage,
  savingStock,
  onCases,
  onUpdate,
}: {
  name: string;
  supplier: string;
  retailUnit: string;
  unitsPerCase: number | null;
  caseCost: number;
  unitCost: number | null;
  onHand: number;
  unitType: string;
  cases: number;
  targetSrp: number | null;
  currentRetail: number;
  marginPct: number | null;
  tone: "healthy" | "thin" | "empty";
  canOverride: boolean;
  casesOnHand: string;
  packSize: number;
  stockMessage: string | null;
  savingStock: boolean;
  onCases: (value: string) => void;
  onUpdate: () => void;
}) {
  return (
    <aside className="overflow-hidden rounded-3xl border border-emerald-500/25 bg-zinc-900/90">
      <div className="border-b border-zinc-800 px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300/80">
          Receipt confirmation
        </p>
        <h3 className="mt-1 text-lg font-black leading-tight text-white">
          {name}
        </h3>
        <p className="mt-1 text-sm text-zinc-300">
          1 case = {formatUnits(unitsPerCase)} {retailUnit}
        </p>
        <p className="text-xs text-zinc-500">{supplier}</p>
      </div>
      <dl className="px-5 py-2">
        <ReceiptRow label="Case cost" value={formatCurrency(caseCost)} />
        <ReceiptRow label="Unit cost" value={formatCurrency(unitCost)} />
        <ReceiptRow
          label="On hand"
          value={`${formatUnits(onHand)} ${stockUnitLabel(unitType)}`}
          emphasis
        />
        <ReceiptRow
          label="Cases"
          value={casesLabel(Number(cases.toFixed(2)))}
        />
        <ReceiptRow label="Target SRP" value={formatCurrency(targetSrp)} />
        <ReceiptRow
          label="Current retail"
          value={formatCurrency(currentRetail)}
        />
      </dl>
      {canOverride ? (
        <div className="mx-5 mb-5">
          <StockOverride
            casesOnHand={casesOnHand}
            packSize={packSize}
            stockMessage={stockMessage}
            savingStock={savingStock}
            onCases={onCases}
            onUpdate={onUpdate}
          />
        </div>
      ) : null}
      <div
        className={`mx-5 mb-5 rounded-2xl px-4 py-3 ${tone === "thin" ? "bg-orange-500/10" : "bg-emerald-500/10"}`}
      >
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          Profit margin
        </p>
        <p
          className={`font-mono text-2xl font-black ${
            tone === "healthy"
              ? "text-emerald-300"
              : tone === "thin"
                ? "text-orange-300"
                : "text-zinc-400"
          }`}
        >
          {formatPercent(marginPct)}%
        </p>
      </div>
    </aside>
  );
}
