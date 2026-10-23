'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, FileUp, LayoutDashboard, RefreshCw, Sheet } from 'lucide-react';
import {
  calculateYieldQuote,
  formatCurrency,
  formatUnits,
  resolveTargetMargin,
  suggestPackDefaults,
  type MarginMode,
  type ReceivingLog,
  type RetailUnit,
} from '@/lib/domains/receiving/yieldPricing';
import { ReceivingDetails } from '@/components/features/receive/ReceivingDetails';
import { YieldBreakdown } from '@/components/features/receive/YieldBreakdown';
import { PricingStrategy } from '@/components/features/receive/PricingStrategy';
import { PackReceiptCard } from '@/components/features/receive/PackReceiptCard';
import { PendingVendorCreditsPanel } from '@/components/features/receive/PendingVendorCreditsPanel';
import { consumeStashedReceivingScan } from '@/lib/domains/receiving/receivingBridge';
import type { ReceivingDispositionRow } from '@/lib/domains/receiving/receivingDisposition';

interface LogsResponse {
  success: boolean;
  source: 'google_sheets' | 'sample';
  sheetName: string;
  logs: ReceivingLog[];
  warning: string | null;
}

const POSTED_RECEIVING_KEY = 'freshloop-posted-receiving';
const HIDDEN_RECEIVING_KEY = 'freshloop-receiving-hidden';

function readPostedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(POSTED_RECEIVING_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function writePostedIds(ids: Set<string>) {
  window.sessionStorage.setItem(POSTED_RECEIVING_KEY, JSON.stringify([...ids]));
}

function readHiddenIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(HIDDEN_RECEIVING_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeHiddenIds(ids: Set<string>) {
  window.sessionStorage.setItem(HIDDEN_RECEIVING_KEY, JSON.stringify([...ids]));
}

function toPositiveNumber(raw: string): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function YieldPricingDashboard({
  onOpenCommandCenter,
  embedded = false,
  extraLogs = [],
  initialLogs,
  initialSource = 'sample',
  initialSheetName = 'Receiving_logs',
  initialWarning = null,
  onScanNext,
  onLogDisposition,
}: {
  onOpenCommandCenter?: () => void;
  embedded?: boolean;
  extraLogs?: ReceivingLog[];
  initialLogs?: ReceivingLog[];
  initialSource?: 'google_sheets' | 'sample';
  initialSheetName?: string;
  initialWarning?: string | null;
  onScanNext?: () => void;
  /** Drop scanned invoice lines from the parent list when removed / not received. */
  onLogDisposition?: (logId: string) => void;
}) {
  const seeded = initialLogs !== undefined;
  const [logs, setLogs] = useState<ReceivingLog[]>(initialLogs ?? []);
  const [source, setSource] = useState<'google_sheets' | 'sample'>(initialSource);
  const [sheetName, setSheetName] = useState(initialSheetName);
  const [warning, setWarning] = useState<string | null>(initialWarning);
  const [loading, setLoading] = useState(!seeded);
  const [selectedId, setSelectedId] = useState<string | null>(initialLogs?.[0]?.id ?? null);

  const [packSize, setPackSize] = useState('12');
  const [yieldDivisor, setYieldDivisor] = useState('1');
  const [retailUnit, setRetailUnit] = useState<RetailUnit>('units');
  const [marginMode, setMarginMode] = useState<MarginMode>('40');
  const [customMarginPercent, setCustomMarginPercent] = useState('35');
  const [currentRetailPrice, setCurrentRetailPrice] = useState('0.00');

  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stockOnHand, setStockOnHand] = useState<number | null>(null);
  const [stockMatched, setStockMatched] = useState(false);
  const [postedIds, setPostedIds] = useState<Set<string>>(() => new Set());
  const [movedNotice, setMovedNotice] = useState<string | null>(null);
  const [stashedScanLogs, setStashedScanLogs] = useState<ReceivingLog[]>([]);
  const [stashedScanNote, setStashedScanNote] = useState<string | null>(null);
  const [hiddenLogIds, setHiddenLogIds] = useState<Set<string>>(() => new Set());
  const [pendingCredits, setPendingCredits] = useState<ReceivingDispositionRow[]>([]);
  const [dispositionBusy, setDispositionBusy] = useState(false);
  const [resolvingCreditId, setResolvingCreditId] = useState<string | null>(null);
  const stockRequest = useRef(0);
  const postedIdsRef = useRef<Set<string>>(new Set());

  const loadDispositions = async () => {
    try {
      const response = await fetch('/api/receiving-dispositions', { cache: 'no-store' });
      const json = (await response.json()) as {
        success?: boolean;
        pendingCredits?: ReceivingDispositionRow[];
        hiddenLogIds?: string[];
      };
      if (!json.success) return;
      setPendingCredits(Array.isArray(json.pendingCredits) ? json.pendingCredits : []);
      const merged = new Set([
        ...readHiddenIds(),
        ...(Array.isArray(json.hiddenLogIds) ? json.hiddenLogIds : []),
      ]);
      writeHiddenIds(merged);
      setHiddenLogIds(merged);
    } catch {
      /* table may not be migrated yet */
    }
  };

  const loadLogs = async (background = false) => {
    if (!background) setLoading(true);
    try {
      const response = await fetch('/api/receiving-logs', { cache: 'no-store' });
      const json = (await response.json()) as LogsResponse;
      const nextLogs = Array.isArray(json.logs) ? json.logs : [];
      setLogs(nextLogs);
      setSource(json.source === 'google_sheets' ? 'google_sheets' : 'sample');
      setSheetName(json.sheetName || 'Receiving_logs');
      setWarning(json.warning);
      setSelectedId((current) => {
        if (current) return current;
        return nextLogs[0]?.id ?? null;
      });
    } catch {
      setWarning('Receiving logs could not be loaded.');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const stored = readPostedIds();
    postedIdsRef.current = stored;
    setPostedIds(stored);
    setHiddenLogIds(readHiddenIds());
    void loadLogs(seeded);
    void loadDispositions();
    const stashed = consumeStashedReceivingScan();
    if (stashed?.logs.length) {
      setStashedScanLogs(stashed.logs);
      setStashedScanNote(stashed.note);
      setSelectedId(stashed.logs[0]?.id ?? null);
      if (stashed.note) setMovedNotice(stashed.note);
    }
  }, []);

  const visibleLogs = useMemo(() => {
    const merged = [...extraLogs, ...stashedScanLogs, ...logs];
    const seen = new Set<string>();
    return merged.filter((log) => {
      if (seen.has(log.id)) return false;
      seen.add(log.id);
      return true;
    });
  }, [extraLogs, stashedScanLogs, logs]);

  const openLogs = useMemo(
    () => visibleLogs.filter((log) => !postedIds.has(log.id) && !hiddenLogIds.has(log.id)),
    [visibleLogs, postedIds, hiddenLogIds]
  );

  const extraKey = extraLogs.map((log) => log.id).join('|');

  useEffect(() => {
    if (extraLogs.length === 0) return;
    setSelectedId((current) => {
      if (current && openLogs.some((log) => log.id === current)) return current;
      return openLogs[0]?.id ?? null;
    });
  }, [extraKey]);

  useEffect(() => {
    setSelectedId((current) => {
      if (!current) return openLogs[0]?.id ?? null;
      if (openLogs.some((log) => log.id === current)) return current;
      return openLogs[0]?.id ?? null;
    });
  }, [openLogs]);

  const selected = openLogs.find((log) => log.id === selectedId) ?? openLogs[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    const defaults = suggestPackDefaults(selected.itemName);
    const nextPackSize = selected.packSize && selected.packSize > 0 ? String(selected.packSize) : defaults.packSize;
    const nextRetailUnit = selected.retailUnit ?? defaults.retailUnit;
    const targetMargin = resolveTargetMargin('40', 35);
    const quote = calculateYieldQuote({
      caseCost: selected.caseCost,
      packSize: Number(nextPackSize),
      yieldDivisor: Number(defaults.yieldDivisor),
      targetMargin,
      currentRetailPrice: 0,
    });
    setPackSize(nextPackSize);
    setYieldDivisor(defaults.yieldDivisor);
    setRetailUnit(nextRetailUnit);
    setMarginMode('40');
    setCurrentRetailPrice(quote.targetSrp !== null ? quote.targetSrp.toFixed(2) : '0.00');
    setSavedMessage(null);
    setErrorMessage(null);
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const name = selected.itemName;
    const request = ++stockRequest.current;
    let cancelled = false;
    setStockOnHand(null);
    setStockMatched(false);
    void fetch(`/api/inventory/on-hand?name=${encodeURIComponent(name)}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((json) => {
        if (cancelled || request !== stockRequest.current || !json.success) return;
        setStockMatched(Boolean(json.matched));
        setStockOnHand(Number(json.onHand) || 0);
      })
      .catch(() => {
        if (!cancelled) setStockOnHand(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const targetMargin = resolveTargetMargin(marginMode, toPositiveNumber(customMarginPercent));
  const priceNumber = toPositiveNumber(currentRetailPrice);

  const quote = useMemo(() => {
    if (!selected) {
      return calculateYieldQuote({
        caseCost: 0,
        packSize: 0,
        yieldDivisor: 0,
        targetMargin,
        currentRetailPrice: priceNumber,
      });
    }
    return calculateYieldQuote({
      caseCost: selected.caseCost,
      packSize: toPositiveNumber(packSize),
      yieldDivisor: toPositiveNumber(yieldDivisor),
      targetMargin,
      currentRetailPrice: priceNumber,
    });
  }, [selected, packSize, yieldDivisor, targetMargin, priceNumber]);

  const hideLogFromBoard = (removedId: string, notice: string) => {
    setHiddenLogIds((prev) => {
      const next = new Set(prev);
      next.add(removedId);
      writeHiddenIds(next);
      return next;
    });
    setStashedScanLogs((prev) => prev.filter((log) => log.id !== removedId));
    onLogDisposition?.(removedId);
    setSavedMessage(null);
    setErrorMessage(null);
    setMovedNotice(notice);
  };

  const postDisposition = async (reason: 'NOT_RECEIVED' | 'REMOVED') => {
    if (!selected) return;
    const removedId = selected.id;
    const removedName = selected.itemName;
    const notice =
      reason === 'NOT_RECEIVED'
        ? `${removedName} moved to pending vendor credit (not on delivery).`
        : `${removedName} removed from the receiving list.`;

    const previousHidden = new Set(hiddenLogIds);
    hideLogFromBoard(removedId, notice);

    setDispositionBusy(true);
    try {
      const response = await fetch('/api/receiving-dispositions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalLogId: removedId,
          itemName: removedName,
          casesReceived: selected.casesReceived,
          caseCost: selected.caseCost,
          reason,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setHiddenLogIds(previousHidden);
        writeHiddenIds(previousHidden);
        setErrorMessage(json.error || 'Could not update this line.');
        setMovedNotice(null);
        return;
      }
      setPendingCredits(Array.isArray(json.pendingCredits) ? json.pendingCredits : []);
      const merged = new Set([
        ...previousHidden,
        removedId,
        ...(Array.isArray(json.hiddenLogIds) ? json.hiddenLogIds : []),
      ]);
      writeHiddenIds(merged);
      setHiddenLogIds(merged);
    } catch {
      setHiddenLogIds(previousHidden);
      writeHiddenIds(previousHidden);
      setErrorMessage('Could not update this line. Check the connection and try again.');
      setMovedNotice(null);
    } finally {
      setDispositionBusy(false);
    }
  };

  const handleMarkCredited = async (id: string) => {
    setResolvingCreditId(id);
    try {
      const response = await fetch(`/api/receiving-dispositions/${id}`, { method: 'PATCH' });
      const json = await response.json();
      if (response.ok && json.success) {
        setPendingCredits(Array.isArray(json.pendingCredits) ? json.pendingCredits : []);
        setMovedNotice('Vendor credit marked as received from supplier.');
      }
    } finally {
      setResolvingCreditId(null);
    }
  };

  const markLogPosted = (logId: string) => {
    setPostedIds((prev) => {
      const next = new Set(prev);
      next.add(logId);
      postedIdsRef.current = next;
      writePostedIds(next);
      return next;
    });
  };

  const purgeLogFromLocalSources = (logId: string) => {
    setStashedScanLogs((prev) => prev.filter((log) => log.id !== logId));
    onLogDisposition?.(logId);
  };

  const handleSave = async () => {
    if (!selected) return;
    const savedId = selected.id;
    const savedName = selected.itemName;
    const previousPosted = new Set(postedIdsRef.current);

    markLogPosted(savedId);
    setSaving(true);
    setSavedMessage(null);
    setErrorMessage(null);
    setMovedNotice(null);

    try {
      const response = await fetch('/api/receiving-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName: savedName,
          casesReceived: selected.casesReceived,
          caseCost: selected.caseCost,
          packSize: toPositiveNumber(packSize),
          yieldDivisor: toPositiveNumber(yieldDivisor),
          retailUnit,
          marginMode,
          customMarginPercent: toPositiveNumber(customMarginPercent),
          currentRetailPrice: priceNumber,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        postedIdsRef.current = previousPosted;
        writePostedIds(previousPosted);
        setPostedIds(previousPosted);
        setErrorMessage(json.error || 'Save failed.');
        return;
      }
      if (!json.stock?.posted) {
        postedIdsRef.current = previousPosted;
        writePostedIds(previousPosted);
        setPostedIds(previousPosted);
        setErrorMessage(
          json.stock?.reason || 'Stock was not updated, so this case stays on the receiving list.'
        );
        return;
      }

      purgeLogFromLocalSources(savedId);
      stockRequest.current += 1;
      setMovedNotice(
        `${savedName} is in inventory. ${formatUnits(Number(json.stock.onHand))} ${retailUnit} on hand.`
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('freshloop-inventory-updated'));
      }
    } catch {
      postedIdsRef.current = previousPosted;
      writePostedIds(previousPosted);
      setPostedIds(previousPosted);
      setErrorMessage('Save failed. Check the connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={embedded ? '' : 'mx-auto w-full max-w-7xl flex-1 px-3 py-5 pb-28 sm:px-6 sm:py-8'}>
      <div className={`mb-5 flex flex-col gap-3 sm:flex-row sm:items-center ${embedded ? 'sm:justify-end' : 'sm:justify-between'}`}>
        <div>
          <h1 className={`${embedded ? 'sr-only' : 'text-2xl font-black tracking-tight text-white'}`}>
            Yield &amp; Pricing
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-bold text-zinc-300">
              <Sheet className="h-3 w-3 text-emerald-300" />
              {sheetName}
            </span>
            <span>{source === 'google_sheets' ? 'Live sheet' : 'Sample rows'}</span>
            {warning ? (
              <span className="inline-flex items-center gap-1 text-zinc-500">
                <AlertTriangle className="h-3 w-3" />
                Connect a sheet to replace the sample.
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadLogs()}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-200 hover:border-emerald-500/40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-emerald-300' : ''}`} />
            Refresh
          </button>
          {onOpenCommandCenter ? (
            <button
              type="button"
              onClick={onOpenCommandCenter}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-200 hover:border-emerald-500/40"
            >
              <LayoutDashboard className="h-3.5 w-3.5 text-emerald-300" />
              Command Center
            </button>
          ) : null}
        </div>
      </div>

      {loading && visibleLogs.length === 0 ? (
        <p className="text-sm text-zinc-400">Loading receiving logs…</p>
      ) : null}

      {!loading && openLogs.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 px-6 py-16 text-center backdrop-blur-md">
          <FileUp className="h-14 w-14 text-slate-500" strokeWidth={1.25} />
          <p className="mt-5 max-w-md text-base font-black tracking-tight text-slate-100">
            All items processed successfully. Ready for the next delivery.
          </p>
          <button
            type="button"
            onClick={() => onScanNext?.()}
            className="mt-6 rounded-2xl bg-[#3E5C78] px-6 py-3.5 text-sm font-black text-slate-50 transition hover:bg-[#4E7090]"
          >
            Scan Next Invoice
          </button>
        </div>
      ) : null}

      {movedNotice ? (
        <p className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200">
          {movedNotice}{' '}
          <Link href="/inventory" className="underline decoration-emerald-300/70 underline-offset-2">
            Open inventory
          </Link>
        </p>
      ) : null}

      <PendingVendorCreditsPanel
        items={pendingCredits}
        resolvingId={resolvingCreditId}
        onMarkCredited={(id) => void handleMarkCredited(id)}
      />

      {selected ? (
        <div className="space-y-4 pb-40">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden">
            {openLogs.map((log) => {
              const active = log.id === selected.id;
              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setSelectedId(log.id)}
                  className={`shrink-0 rounded-2xl border px-3 py-2 text-left ${
                    active
                      ? 'border-emerald-400 bg-emerald-400 text-zinc-950'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-200'
                  }`}
                >
                  <span className="block max-w-[11rem] truncate text-xs font-black">{log.itemName}</span>
                  <span className={`text-[10px] font-bold ${active ? 'text-zinc-800' : 'text-zinc-500'}`}>
                    {log.casesReceived} cases · {formatCurrency(log.caseCost)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav className="sticky top-4 hidden max-h-[calc(100dvh-6rem)] overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/80 lg:block">
            <p className="border-b border-zinc-800 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Received items
            </p>
            <ul className="max-h-[calc(100dvh-9rem)] divide-y divide-zinc-800/80 overflow-y-auto">
              {openLogs.map((log) => {
                const active = log.id === selected.id;
                return (
                  <li key={log.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(log.id)}
                      className={`block w-full px-4 py-3 text-left transition ${
                        active ? 'bg-emerald-400 text-zinc-950' : 'text-zinc-200 hover:bg-zinc-800/70'
                      }`}
                    >
                      <span className="block text-sm font-black leading-snug">{log.itemName}</span>
                      <span className={`mt-1 flex items-center justify-between gap-2 text-[11px] ${active ? 'text-zinc-800' : 'text-zinc-500'}`}>
                        <span>
                          {log.casesReceived} cases
                        </span>
                        <span className="font-mono font-bold">{formatCurrency(log.caseCost)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]">
          <div id="yield-editor" className="space-y-5 rounded-3xl border border-zinc-800 bg-zinc-900/80 p-4 sm:p-5">
            <ReceivingDetails log={selected} />
            <div className="border-t border-zinc-800" />
            <YieldBreakdown
              packSize={packSize}
              yieldDivisor={yieldDivisor}
              retailUnit={retailUnit}
              onPackSize={(value) => {
                setPackSize(value);
                setSavedMessage(null);
              }}
              onYieldDivisor={(value) => {
                setYieldDivisor(value);
                setSavedMessage(null);
              }}
              onRetailUnit={(value) => {
                setRetailUnit(value);
                setSavedMessage(null);
              }}
            />
            <div className="border-t border-zinc-800" />
            <PricingStrategy
              quote={quote}
              marginMode={marginMode}
              customMarginPercent={customMarginPercent}
              currentRetailPrice={currentRetailPrice}
              onMarginMode={(mode) => {
                setMarginMode(mode);
                setSavedMessage(null);
              }}
              onCustomMargin={(value) => {
                setCustomMarginPercent(value);
                setSavedMessage(null);
              }}
              onCurrentRetailPrice={(value) => {
                setCurrentRetailPrice(value);
                setSavedMessage(null);
              }}
            />
          </div>

          <PackReceiptCard
            log={selected}
            retailUnit={retailUnit}
            quote={quote}
            currentRetailPrice={priceNumber}
            saving={saving}
            savedMessage={savedMessage}
            errorMessage={errorMessage}
            stockOnHand={stockOnHand}
            stockMatched={stockMatched}
            alreadyInInventory={postedIds.has(selected.id)}
            dispositionBusy={dispositionBusy}
            onSave={() => void handleSave()}
            onNotReceived={() => void postDisposition('NOT_RECEIVED')}
            onRemoveFromList={() => void postDisposition('REMOVED')}
          />
          </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
