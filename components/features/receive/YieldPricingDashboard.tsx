'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, LayoutDashboard, Receipt, RefreshCw, Sheet } from 'lucide-react';
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
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { cn } from '@/lib/utils/cn';
import { consumeStashedReceivingScan } from '@/lib/domains/receiving/receivingBridge';
import { readReceivingPrefs, writeReceivingPrefs } from '@/lib/domains/receiving/receivingPreferences';
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

interface LogPricing {
  packSize: number;
  yieldDivisor: number;
  retailUnit: RetailUnit;
  marginMode: MarginMode;
  customMarginPercent: number;
  currentRetailPrice: number;
}

function resolveLogPricing(log: ReceivingLog, live: (LogPricing & { id: string }) | null): LogPricing {
  if (live && live.id === log.id) {
    return {
      packSize: live.packSize,
      yieldDivisor: live.yieldDivisor,
      retailUnit: live.retailUnit,
      marginMode: live.marginMode,
      customMarginPercent: live.customMarginPercent,
      currentRetailPrice: live.currentRetailPrice,
    };
  }

  const defaults = suggestPackDefaults(log.itemName);
  const saved = readReceivingPrefs(log.itemName);
  const packFromSheet = log.packSize && log.packSize > 0 ? log.packSize : 0;
  const packSize = packFromSheet || toPositiveNumber(saved?.packSize ?? defaults.packSize) || toPositiveNumber(defaults.packSize);
  const yieldDivisor = toPositiveNumber(saved?.yieldDivisor ?? defaults.yieldDivisor) || 1;
  const retailUnit = log.retailUnit ?? saved?.retailUnit ?? defaults.retailUnit;
  const marginMode = saved?.marginMode ?? '40';
  const customMarginPercent = toPositiveNumber(saved?.customMarginPercent ?? '35') || 35;
  const targetMargin = resolveTargetMargin(marginMode, customMarginPercent);
  const quote = calculateYieldQuote({
    caseCost: log.caseCost,
    packSize,
    yieldDivisor,
    targetMargin,
    currentRetailPrice: 0,
  });

  return {
    packSize,
    yieldDivisor,
    retailUnit,
    marginMode,
    customMarginPercent,
    currentRetailPrice: quote.targetSrp !== null ? Number(quote.targetSrp.toFixed(2)) : 0,
  };
}

async function postLogToInventory(log: ReceivingLog, pricing: LogPricing) {
  const response = await fetch('/api/receiving-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      itemName: log.itemName,
      casesReceived: log.casesReceived,
      caseCost: log.caseCost,
      packSize: pricing.packSize,
      yieldDivisor: pricing.yieldDivisor,
      retailUnit: pricing.retailUnit,
      marginMode: pricing.marginMode,
      customMarginPercent: pricing.customMarginPercent,
      currentRetailPrice: pricing.currentRetailPrice,
    }),
  });
  let json: {
    success?: boolean;
    error?: string;
    stock?: { posted?: boolean; reason?: string; onHand?: number; productId?: string };
  } = {};
  try {
    json = await response.json();
  } catch {
    json = {};
  }
  const reason = json.stock?.reason || json.error || 'Save failed.';
  return {
    ok: response.ok && Boolean(json.success) && Boolean(json.stock?.posted),
    reason,
    onHand: Number(json.stock?.onHand),
    productId: typeof json.stock?.productId === 'string' ? json.stock.productId : undefined,
  };
}

function MovedNoticeBanner({ notice }: { notice: string }) {
  if (notice.startsWith('__STOCK__')) {
    const parts = notice.split('__');
    const href = parts[2] ?? '/inventory';
    const name = parts[3] ?? 'Item';
    const onHand = parts[4] ?? '0';
    const unit = parts[5] ?? 'units';
    return (
      <p className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200">
        {name} is in inventory. {onHand} {unit} on hand.{' '}
        <Link href={href} className="underline decoration-emerald-300/70 underline-offset-2">
          View updated stock
        </Link>
      </p>
    );
  }
  return (
    <p className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200">
      {notice}{' '}
      <Link href="/inventory" className="underline decoration-emerald-300/70 underline-offset-2">
        Open inventory
      </Link>
    </p>
  );
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
  const [savingAll, setSavingAll] = useState(false);
  const [saveAllProgress, setSaveAllProgress] = useState<string | null>(null);
  const [savedPrefsHint, setSavedPrefsHint] = useState<string | null>(null);
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
  const [animatingOutIds, setAnimatingOutIds] = useState<Set<string>>(() => new Set());
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

  const invoiceLogIds = useMemo(() => {
    const ids = new Set<string>();
    for (const log of extraLogs) ids.add(log.id);
    for (const log of stashedScanLogs) ids.add(log.id);
    return ids;
  }, [extraLogs, stashedScanLogs]);

  const bulkLogs = useMemo(() => {
    const invoiceOpen = openLogs.filter((log) => invoiceLogIds.has(log.id));
    return invoiceOpen.length > 0 ? invoiceOpen : openLogs;
  }, [openLogs, invoiceLogIds]);

  const saveAllLabel =
    invoiceLogIds.size > 0
      ? `Save all ${bulkLogs.length} invoice items`
      : `Save all ${bulkLogs.length} items`;

  const listLogs = useMemo(() => {
    const rows = [...openLogs];
    const seen = new Set(rows.map((log) => log.id));
    for (const id of animatingOutIds) {
      if (seen.has(id)) continue;
      const log = visibleLogs.find((row) => row.id === id);
      if (log) {
        rows.push(log);
        seen.add(id);
      }
    }
    return rows;
  }, [openLogs, animatingOutIds, visibleLogs]);

  const boardActive = openLogs.length > 0 || animatingOutIds.size > 0;

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

  const selected =
    listLogs.find((log) => log.id === selectedId) ?? openLogs[0] ?? listLogs[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    const defaults = suggestPackDefaults(selected.itemName);
    const saved = readReceivingPrefs(selected.itemName);
    const nextPackSize =
      selected.packSize && selected.packSize > 0
        ? String(selected.packSize)
        : (saved?.packSize ?? defaults.packSize);
    const nextYieldDivisor = saved?.yieldDivisor ?? defaults.yieldDivisor;
    const nextRetailUnit = selected.retailUnit ?? saved?.retailUnit ?? defaults.retailUnit;
    const nextMarginMode = saved?.marginMode ?? '40';
    const nextCustomMargin = saved?.customMarginPercent ?? '35';
    const targetMargin = resolveTargetMargin(nextMarginMode, toPositiveNumber(nextCustomMargin));
    const quote = calculateYieldQuote({
      caseCost: selected.caseCost,
      packSize: Number(nextPackSize),
      yieldDivisor: Number(nextYieldDivisor),
      targetMargin,
      currentRetailPrice: 0,
    });
    setPackSize(nextPackSize);
    setYieldDivisor(nextYieldDivisor);
    setRetailUnit(nextRetailUnit);
    setMarginMode(nextMarginMode);
    setCustomMarginPercent(nextCustomMargin);
    setCurrentRetailPrice(quote.targetSrp !== null ? quote.targetSrp.toFixed(2) : '0.00');
    setSavedMessage(null);
    setErrorMessage(null);

    const sheetOverridesPack = Boolean(selected.packSize && selected.packSize > 0);
    if (!sheetOverridesPack && saved) {
      const savedDate = new Date(saved.updatedAt);
      const label = Number.isFinite(savedDate.getTime())
        ? savedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : 'prior session';
      setSavedPrefsHint(
        `Using saved defaults (pack ${saved.packSize}, yield ÷${saved.yieldDivisor}, margin ${saved.marginMode ?? '40'}%) from ${label}.`
      );
    } else {
      setSavedPrefsHint(null);
    }
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

  const finishSavedLog = (
    savedId: string,
    savedName: string,
    onHand: number,
    productId?: string
  ) => {
    setAnimatingOutIds((prev) => new Set(prev).add(savedId));
    setSavedMessage('Saved to inventory.');
    window.setTimeout(() => {
      markLogPosted(savedId);
      purgeLogFromLocalSources(savedId);
      setAnimatingOutIds((prev) => {
        const next = new Set(prev);
        next.delete(savedId);
        return next;
      });
      setSavedMessage(null);
      stockRequest.current += 1;
      const stockHref = productId
        ? `/inventory?highlight=${encodeURIComponent(productId)}`
        : '/inventory';
      setMovedNotice(`__STOCK__${stockHref}__${savedName}__${formatUnits(onHand)}__${retailUnit}`);
      window.dispatchEvent(new CustomEvent('freshloop-inventory-updated'));
    }, 340);
  };

  const livePricing = (): LogPricing & { id: string } | null => {
    if (!selected) return null;
    return {
      id: selected.id,
      packSize: toPositiveNumber(packSize),
      yieldDivisor: toPositiveNumber(yieldDivisor),
      retailUnit,
      marginMode,
      customMarginPercent: toPositiveNumber(customMarginPercent),
      currentRetailPrice: priceNumber,
    };
  };

  const rememberPricing = (itemName: string, pricing: LogPricing) => {
    writeReceivingPrefs(itemName, {
      packSize: String(pricing.packSize),
      yieldDivisor: String(pricing.yieldDivisor),
      retailUnit: pricing.retailUnit,
      marginMode: pricing.marginMode,
      customMarginPercent: String(pricing.customMarginPercent),
    });
  };

  const handleSave = async () => {
    if (!selected || animatingOutIds.has(selected.id) || savingAll) return;
    const savedId = selected.id;
    const savedName = selected.itemName;
    const pricing = resolveLogPricing(selected, livePricing());

    setSaving(true);
    setSavedMessage(null);
    setErrorMessage(null);
    setMovedNotice(null);

    try {
      const result = await postLogToInventory(selected, pricing);
      if (!result.ok) {
        setErrorMessage(
          result.reason || 'Stock was not updated, so this case stays on the receiving list.'
        );
        return;
      }

      rememberPricing(savedName, pricing);
      finishSavedLog(savedId, savedName, result.onHand, result.productId);
    } catch {
      setErrorMessage('Save failed. Check the connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    const targets = bulkLogs.filter((log) => !animatingOutIds.has(log.id));
    if (targets.length === 0 || saving || savingAll) return;

    const live = livePricing();
    setSavingAll(true);
    setSavedMessage(null);
    setErrorMessage(null);
    setMovedNotice(null);

    const failed: string[] = [];
    let savedCount = 0;
    let lastName = '';
    let lastOnHand = 0;
    let lastProductId: string | undefined;
    let lastUnit: RetailUnit = 'units';

    try {
      for (let index = 0; index < targets.length; index += 1) {
        const log = targets[index];
        setSaveAllProgress(`${index + 1} of ${targets.length}`);
        const pricing = resolveLogPricing(log, live);
        try {
          const result = await postLogToInventory(log, pricing);
          if (!result.ok) {
            failed.push(`${log.itemName} (${result.reason})`);
            continue;
          }
          rememberPricing(log.itemName, pricing);
          markLogPosted(log.id);
          purgeLogFromLocalSources(log.id);
          savedCount += 1;
          lastName = log.itemName;
          lastOnHand = result.onHand;
          lastProductId = result.productId;
          lastUnit = pricing.retailUnit;
        } catch {
          failed.push(`${log.itemName} (connection error)`);
        }
      }
    } finally {
      setSavingAll(false);
      setSaveAllProgress(null);
    }

    if (savedCount > 0) {
      stockRequest.current += 1;
      window.dispatchEvent(new CustomEvent('freshloop-inventory-updated'));
    }

    if (savedCount === 1 && failed.length === 0) {
      const stockHref = lastProductId
        ? `/inventory?highlight=${encodeURIComponent(lastProductId)}`
        : '/inventory';
      setMovedNotice(`__STOCK__${stockHref}__${lastName}__${formatUnits(lastOnHand)}__${lastUnit}`);
      setSavedMessage('Saved to inventory.');
      return;
    }

    if (savedCount > 0 && failed.length === 0) {
      setMovedNotice(`Saved ${savedCount} items to inventory.`);
      return;
    }

    if (savedCount > 0) {
      setMovedNotice(`Saved ${savedCount} of ${targets.length} items to inventory.`);
      setErrorMessage(`Still on the list: ${failed.join('; ')}`);
      return;
    }

    setErrorMessage(failed.length ? `Nothing saved. ${failed.join('; ')}` : 'Nothing saved.');
  };

  return (
    <div className={embedded ? '' : 'mx-auto w-full max-w-7xl flex-1 px-3 py-5 pb-28 sm:px-6 sm:py-8'}>
      <div className={`mb-5 flex flex-col gap-3 sm:flex-row sm:items-center ${embedded ? 'sm:justify-end' : 'sm:justify-between'}`}>
        <div>
          <h1 className={`${embedded ? 'sr-only' : 'text-2xl font-black tracking-tight text-white'}`}>
            Yield &amp; Pricing
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 font-bold text-slate-300">
              <Sheet className="h-3 w-3 text-emerald-300" />
              {sheetName}
            </span>
            <span>{source === 'google_sheets' ? 'Live sheet' : 'Sample rows'}</span>
            {warning ? (
              <span className="inline-flex items-center gap-1 text-slate-500">
                <AlertTriangle className="h-3 w-3" />
                Connect a sheet to replace the sample.
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="text-xs py-2" onClick={() => void loadLogs()}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-emerald-300' : ''}`} />
            Refresh
          </Button>
          {onOpenCommandCenter ? (
            <Button variant="secondary" className="text-xs py-2" onClick={onOpenCommandCenter}>
              <LayoutDashboard className="h-3.5 w-3.5 text-emerald-300" />
              Command Center
            </Button>
          ) : null}
        </div>
      </div>

      {loading && visibleLogs.length === 0 ? (
        <p className="text-sm text-slate-400">Loading receiving logs…</p>
      ) : null}

      {!loading && !boardActive ? (
        <Card className="border-dashed border-slate-700 bg-slate-900/50 backdrop-blur-md transition-opacity duration-500">
          <CardBody className="flex flex-col items-center px-6 py-16 text-center">
            <Receipt className="h-16 w-16 text-slate-600" strokeWidth={1.1} aria-hidden />
            <p className="mt-6 max-w-md text-lg font-black tracking-tight text-slate-100">
              All items processed successfully
            </p>
            <p className="mt-2 max-w-sm text-sm text-slate-400">
              Nothing left on this delivery. Scan the next invoice or pick another shipment when it arrives.
            </p>
            <Button
              variant="success"
              className="mt-8 px-6 py-3.5 text-sm"
              onClick={() => onScanNext?.()}
            >
              Scan next invoice / delivery
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {movedNotice ? (
        <MovedNoticeBanner notice={movedNotice} />
      ) : null}

      <PendingVendorCreditsPanel
        items={pendingCredits}
        resolvingId={resolvingCreditId}
        onMarkCredited={(id) => void handleMarkCredited(id)}
      />

      {selected && boardActive ? (
        <div
          className={cn(
            'space-y-4 pb-56 transition-opacity duration-300',
            animatingOutIds.has(selected.id) && 'opacity-90'
          )}
        >
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden">
            {listLogs.map((log) => {
              const active = log.id === selected.id;
              const exiting = animatingOutIds.has(log.id);
              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setSelectedId(log.id)}
                  disabled={exiting}
                  className={cn(
                    'shrink-0 rounded-2xl border px-3 py-2 text-left transition-all duration-300 ease-out',
                    exiting && 'pointer-events-none scale-95 opacity-0',
                    active
                      ? 'border-emerald-400 bg-emerald-400 text-slate-950'
                      : 'border-slate-700 bg-slate-900 text-slate-200'
                  )}
                >
                  <span className="block max-w-[11rem] truncate text-xs font-black">{log.itemName}</span>
                  <span className={`text-[10px] font-bold ${active ? 'text-slate-800' : 'text-slate-500'}`}>
                    {log.casesReceived} cases · {formatCurrency(log.caseCost)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav className="sticky top-4 hidden max-h-[calc(100dvh-6rem)] overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80 lg:block">
            <p className="border-b border-slate-800 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Received items
            </p>
            <ul className="max-h-[calc(100dvh-9rem)] divide-y divide-slate-800/80 overflow-y-auto">
              {listLogs.map((log) => {
                const active = log.id === selected.id;
                const exiting = animatingOutIds.has(log.id);
                return (
                  <li
                    key={log.id}
                    className={cn(
                      'overflow-hidden transition-all duration-300 ease-out',
                      exiting && 'max-h-0 opacity-0'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(log.id)}
                      disabled={exiting}
                      className={cn(
                        'block w-full px-4 py-3 text-left transition-colors',
                        active ? 'bg-emerald-400 text-slate-950' : 'text-slate-200 hover:bg-slate-800/70',
                        exiting && 'py-0'
                      )}
                    >
                      <span className="block text-sm font-black leading-snug">{log.itemName}</span>
                      <span className={`mt-1 flex items-center justify-between gap-2 text-[11px] ${active ? 'text-slate-800' : 'text-slate-500'}`}>
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
          <div id="yield-editor" className="space-y-5 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5">
            <ReceivingDetails log={selected} />
            {savedPrefsHint ? (
              <p className="rounded-2xl border border-blue-900/40 bg-blue-950/30 px-3.5 py-2.5 text-[11px] font-semibold leading-snug text-blue-200/95">
                {savedPrefsHint}
              </p>
            ) : null}
            <div className="border-t border-slate-800" />
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
            <div className="border-t border-slate-800" />
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
            saving={saving || savingAll}
            savedMessage={savedMessage}
            errorMessage={errorMessage}
            stockOnHand={stockOnHand}
            stockMatched={stockMatched}
            alreadyInInventory={postedIds.has(selected.id)}
            dispositionBusy={dispositionBusy}
            saveAllLabel={bulkLogs.length > 1 ? saveAllLabel : null}
            saveAllProgress={saveAllProgress}
            onSave={() => void handleSave()}
            onSaveAll={bulkLogs.length > 1 ? () => void handleSaveAll() : undefined}
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
