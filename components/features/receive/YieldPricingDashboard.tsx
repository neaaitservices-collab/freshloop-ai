'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, LayoutDashboard, Receipt, RefreshCw, Sheet } from 'lucide-react';
import {
  calculateYieldQuote,
  caseFloorFromPerUnitFloor,
  formatUnits,
  perUnitFloorFromCaseFloor,
  resolveTargetMargin,
  suggestPackDefaults,
  type MarginMode,
  type ReceivingLog,
  type RetailUnit,
} from '@/lib/domains/receiving/yieldPricing';
import { InvoiceItemsCarousel } from '@/components/features/receive/InvoiceItemsCarousel';
import { ReceivingPricingYieldCard } from '@/components/features/receive/ReceivingPricingYieldCard';
import { PackReceiptCard } from '@/components/features/receive/PackReceiptCard';
import { PendingVendorCreditsPanel } from '@/components/features/receive/PendingVendorCreditsPanel';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { cn } from '@/lib/utils/cn';
import {
  applyPresetMarginToUnitPrice,
  parseCatalogPriceInput,
} from '@/lib/domains/receiving/catalogItemPricing';
import { consumeStashedReceivingScan } from '@/lib/domains/receiving/receivingBridge';
import { readReceivingPrefs, writeReceivingPrefs } from '@/lib/domains/receiving/receivingPreferences';
import type { ReceivingDispositionRow } from '@/lib/domains/receiving/receivingDisposition';
import type { ReceivingLogSource } from '@/lib/domains/receiving/receivingSheet';
import { interpretReceivingBatchResponse } from '@/lib/domains/receiving/receivingBatchResult';
import { describeBatchSaveOutcome } from '@/lib/domains/receiving/invoiceIdentityHold';
import { SUPPLIER_REQUIRED_ERROR } from '@/lib/domains/receiving/invoiceDeliveryId';

interface LogsResponse {
  success: boolean;
  source: ReceivingLogSource | 'sample';
  sheetName: string;
  logs: ReceivingLog[];
  warning: string | null;
}

function normalizeLogSource(source: string | undefined): ReceivingLogSource | 'sample' {
  if (source === 'google_sheets' || source === 'unconfigured' || source === 'unavailable') {
    return source;
  }
  return 'sample';
}

function sheetStatusLabel(source: ReceivingLogSource | 'sample'): string {
  if (source === 'google_sheets') return 'Live sheet';
  if (source === 'unconfigured') return 'Sheet not connected';
  if (source === 'unavailable') return 'Sheet unavailable';
  return 'Sample preview';
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
  splitFactor: number;
  retailUnit: RetailUnit;
  marginMode: MarginMode;
  customMarginPercent: number;
  currentRetailPrice: number;
  caseRetailPrice: number | null;
}

function resolveLogPricing(log: ReceivingLog, live: (LogPricing & { id: string }) | null): LogPricing {
  if (live && live.id === log.id) {
    return {
      packSize: live.packSize,
      splitFactor: live.splitFactor,
      retailUnit: live.retailUnit,
      marginMode: live.marginMode,
      customMarginPercent: live.customMarginPercent,
      currentRetailPrice: live.currentRetailPrice,
      caseRetailPrice: live.caseRetailPrice,
    };
  }

  const defaults = suggestPackDefaults(log.itemName);
  const saved = readReceivingPrefs(log.itemName);
  const packFromSheet = log.packSize && log.packSize > 0 ? log.packSize : 0;
  const packSize = packFromSheet || toPositiveNumber(saved?.packSize ?? defaults.packSize) || toPositiveNumber(defaults.packSize);
  const splitFactor = toPositiveNumber(saved?.splitFactor ?? defaults.splitFactor) || 1;
  const retailUnit = log.retailUnit ?? saved?.retailUnit ?? defaults.retailUnit;
  const marginMode = saved?.marginMode ?? '40';
  const customMarginPercent = toPositiveNumber(saved?.customMarginPercent ?? '35') || 35;
  const targetMargin = resolveTargetMargin(marginMode, customMarginPercent);
  const quote = calculateYieldQuote({
    caseCost: log.caseCost,
    packSize,
    splitFactor,
    targetMargin,
    currentRetailPrice: 0,
  });

  return {
    packSize,
    splitFactor,
    retailUnit,
    marginMode,
    customMarginPercent,
    currentRetailPrice: quote.targetSrp !== null ? Number(quote.targetSrp.toFixed(2)) : 0,
    caseRetailPrice:
      log.suggestedCaseFloorPrice !== undefined && log.suggestedCaseFloorPrice > 0
        ? log.suggestedCaseFloorPrice
        : null,
  };
}

async function postLogToInventory(
  log: ReceivingLog,
  pricing: LogPricing,
  supplierId?: string
) {
  const response = await fetch('/api/receiving-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      externalLogId: log.id,
      itemName: log.itemName,
      productId: log.productId,
      casesReceived: log.casesReceived,
      caseCost: log.caseCost,
      packSize: pricing.packSize,
      splitFactor: pricing.splitFactor,
      retailUnit: pricing.retailUnit,
      marginMode: pricing.marginMode,
      customMarginPercent: pricing.customMarginPercent,
      currentRetailPrice: pricing.currentRetailPrice,
      caseRetailPrice: pricing.caseRetailPrice,
      ...(supplierId ? { supplierId } : {}),
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

function logPricingToPostBody(log: ReceivingLog, pricing: LogPricing, supplierId?: string) {
  return {
    externalLogId: log.id,
    itemName: log.itemName,
    productId: log.productId,
    casesReceived: log.casesReceived,
    caseCost: log.caseCost,
    packSize: pricing.packSize,
    splitFactor: pricing.splitFactor,
    retailUnit: pricing.retailUnit,
    marginMode: pricing.marginMode,
    customMarginPercent: pricing.customMarginPercent,
    currentRetailPrice: pricing.currentRetailPrice,
    caseRetailPrice: pricing.caseRetailPrice,
    ...(supplierId ? { supplierId } : {}),
  };
}

async function postLogsBatchToInventory(
  entries: Array<{ log: ReceivingLog; pricing: LogPricing }>,
  supplierId?: string
): Promise<{
  ok: boolean;
  results: Array<{
    externalLogId?: string;
    itemName: string;
    stock: {
      posted: boolean;
      reason?: string;
      onHand?: number;
      productId?: string;
      idempotent?: boolean;
      conflict?: boolean;
      unitsAdded?: number;
    };
  }>;
  error?: string;
}> {
  const response = await fetch('/api/receiving-logs/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      supplierId,
      items: entries.map(({ log, pricing }) => logPricingToPostBody(log, pricing, supplierId)),
    }),
  });
  let json: {
    success?: boolean;
    error?: string;
    results?: Array<{
      externalLogId?: string;
      itemName: string;
      stock: {
        posted: boolean;
        reason?: string;
        onHand?: number;
        productId?: string;
        idempotent?: boolean;
        conflict?: boolean;
        unitsAdded?: number;
      };
    }>;
  } = {};
  try {
    json = await response.json();
  } catch {
    json = {};
  }
  const interpreted = interpretReceivingBatchResponse(response.status, json);
  if (!interpreted.apply) {
    return { ok: false, results: [], error: interpreted.error || 'Batch save failed.' };
  }
  return { ok: true, results: interpreted.results, error: interpreted.error };
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
  initialSource = 'unconfigured',
  initialSheetName = 'Receiving_logs',
  initialWarning = null,
  onScanNext,
  onLogDisposition,
  supplierId,
}: {
  onOpenCommandCenter?: () => void;
  embedded?: boolean;
  extraLogs?: ReceivingLog[];
  initialLogs?: ReceivingLog[];
  initialSource?: ReceivingLogSource | 'sample';
  initialSheetName?: string;
  initialWarning?: string | null;
  onScanNext?: () => void;
  /** Drop scanned invoice lines from the parent list when removed / not received. */
  onLogDisposition?: (logId: string) => void;
  /** Global supplier for posts to `/api/receiving-logs`. */
  supplierId?: string;
}) {
  const seeded = initialLogs !== undefined;
  const [logs, setLogs] = useState<ReceivingLog[]>(initialLogs ?? []);
  const [source, setSource] = useState<ReceivingLogSource | 'sample'>(initialSource);
  const [sheetName, setSheetName] = useState(initialSheetName);
  const [warning, setWarning] = useState<string | null>(initialWarning);
  const [loading, setLoading] = useState(!seeded);
  const [selectedId, setSelectedId] = useState<string | null>(initialLogs?.[0]?.id ?? null);

  const [packSize, setPackSize] = useState('12');
  const [splitFactor, setSplitFactor] = useState('1');
  const [packUnit, setPackUnit] = useState<RetailUnit>('units');
  const [yieldUnit, setYieldUnit] = useState<RetailUnit>('units');
  const [marginMode, setMarginMode] = useState<MarginMode>('40');
  const [customMarginPercent, setCustomMarginPercent] = useState('35');
  const [currentRetailPrice, setCurrentRetailPrice] = useState('0.00');
  const [currentCaseFloor, setCurrentCaseFloor] = useState('0.00');
  const floorFromMargin = useRef(true);

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
      setSource(normalizeLogSource(json.source));
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
      setSelectedId(stashed.logs[0]?.id ?? null);
      if (stashed.note) setMovedNotice(stashed.note);
    }
  }, [seeded]);

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
  }, [extraKey, extraLogs.length, openLogs]);

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
    const nextSplitFactor = saved?.splitFactor ?? defaults.splitFactor;
    const nextRetailUnit = selected.retailUnit ?? saved?.retailUnit ?? defaults.retailUnit;
    const nextMarginMode = saved?.marginMode ?? '40';
    const nextCustomMargin = saved?.customMarginPercent ?? '35';
    const targetMargin = resolveTargetMargin(nextMarginMode, toPositiveNumber(nextCustomMargin));
    const quote = calculateYieldQuote({
      caseCost: selected.caseCost,
      packSize: Number(nextPackSize),
      splitFactor: Number(nextSplitFactor),
      targetMargin,
      currentRetailPrice: 0,
    });
    setPackSize(nextPackSize);
    setSplitFactor(nextSplitFactor);
    setPackUnit(nextRetailUnit);
    setYieldUnit(nextRetailUnit);
    setMarginMode(nextMarginMode);
    setCustomMarginPercent(nextCustomMargin);
    const packNum = Number(nextPackSize);
    const divNum = Number(nextSplitFactor);
    if (
      selected.suggestedCaseFloorPrice !== undefined &&
      selected.suggestedCaseFloorPrice > 0
    ) {
      floorFromMargin.current = false;
      setMarginMode('custom');
      setCurrentCaseFloor(selected.suggestedCaseFloorPrice.toFixed(2));
      const perUnit = perUnitFloorFromCaseFloor(
        selected.suggestedCaseFloorPrice,
        packNum,
        divNum
      );
      setCurrentRetailPrice(perUnit !== null ? perUnit.toFixed(2) : '0.00');
    } else {
      floorFromMargin.current = true;
      const presetUnit =
        nextMarginMode === '35' || nextMarginMode === '40'
          ? applyPresetMarginToUnitPrice({
              mode: nextMarginMode,
              unitCost: quote.unitCost ?? 0,
            })
          : null;
      setCurrentRetailPrice(
        presetUnit ?? (quote.targetSrp !== null ? quote.targetSrp.toFixed(2) : '0.00')
      );
      setCurrentCaseFloor('');
    }
    setSavedMessage(null);
    setErrorMessage(null);

    const sheetOverridesPack = Boolean(selected.packSize && selected.packSize > 0);
    if (!sheetOverridesPack && saved) {
      const savedDate = new Date(saved.updatedAt);
      const label = Number.isFinite(savedDate.getTime())
        ? savedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : 'prior session';
      setSavedPrefsHint(
        `Using saved defaults (pack ${saved.packSize}, yield ÷${saved.splitFactor}, margin ${saved.marginMode ?? '40'}%) from ${label}.`
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
  const packNum = toPositiveNumber(packSize);
  const divNum = toPositiveNumber(splitFactor);

  const quote = useMemo(() => {
    if (!selected) {
      return calculateYieldQuote({
        caseCost: 0,
        packSize: 0,
        splitFactor: 0,
        targetMargin,
        currentRetailPrice: priceNumber,
      });
    }
    return calculateYieldQuote({
      caseCost: selected.caseCost,
      packSize: toPositiveNumber(packSize),
      splitFactor: toPositiveNumber(splitFactor),
      targetMargin,
      currentRetailPrice: priceNumber,
    });
  }, [selected, packSize, splitFactor, targetMargin, priceNumber]);

  useEffect(() => {
    if (!selected || marginMode === 'custom' || !floorFromMargin.current) return;
    const unitCost = quote.unitCost;
    if (unitCost === null || !(unitCost > 0)) return;
    if (marginMode !== '35' && marginMode !== '40') return;
    const next = applyPresetMarginToUnitPrice({ mode: marginMode, unitCost });
    if (next) setCurrentRetailPrice(next);
  }, [selected, marginMode, packNum, divNum, quote.unitCost]);

  const applyMarginMode = (mode: MarginMode) => {
    floorFromMargin.current = mode !== 'custom';
    setMarginMode(mode);
    setSavedMessage(null);
    if (mode === '35' || mode === '40') {
      const unitCost = quote.unitCost;
      if (unitCost !== null && unitCost > 0) {
        const next = applyPresetMarginToUnitPrice({ mode, unitCost });
        if (next) setCurrentRetailPrice(next);
      }
    }
  };

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
      setMovedNotice(`__STOCK__${stockHref}__${savedName}__${formatUnits(onHand)}__${yieldUnit}`);
      window.dispatchEvent(new CustomEvent('freshloop-inventory-updated'));
    }, 340);
  };

  const livePricing = (): LogPricing & { id: string } | null => {
    if (!selected) return null;
    return {
      id: selected.id,
      packSize: toPositiveNumber(packSize),
      splitFactor: toPositiveNumber(splitFactor),
      retailUnit: yieldUnit,
      marginMode,
      customMarginPercent: toPositiveNumber(customMarginPercent),
      currentRetailPrice: priceNumber,
      caseRetailPrice: parseCatalogPriceInput(currentCaseFloor),
    };
  };

  const rememberPricing = (itemName: string, pricing: LogPricing) => {
    writeReceivingPrefs(itemName, {
      packSize: String(pricing.packSize),
      splitFactor: String(pricing.splitFactor),
      retailUnit: pricing.retailUnit,
      marginMode: pricing.marginMode,
      customMarginPercent: String(pricing.customMarginPercent),
    });
  };

  const handleSave = async () => {
    if (!selected || animatingOutIds.has(selected.id) || savingAll) return;
    if (selected.invoiceNumber && !supplierId) {
      setErrorMessage(SUPPLIER_REQUIRED_ERROR);
      return;
    }
    if (selected.canPost === false) {
      setErrorMessage(
        selected.invoiceNumber
          ? 'This invoice line does not have a server delivery id yet. Choose a saved supplier and wait for the lines to be identified.'
          : 'This sheet row has no Delivery ID, so it was not posted. Add a UUID in the Delivery ID column and keep it with that delivery.'
      );
      return;
    }
    const savedId = selected.id;
    const savedName = selected.itemName;
    const pricing = resolveLogPricing(selected, livePricing());

    setSaving(true);
    setSavedMessage(null);
    setErrorMessage(null);
    setMovedNotice(null);

    try {
      const result = await postLogToInventory(selected, pricing, supplierId);
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
    const targets = bulkLogs.filter((log) => !animatingOutIds.has(log.id) && log.canPost !== false);
    if (saving || savingAll) return;
    if (targets.length === 0) {
      setErrorMessage(
        'None of these rows have a Delivery ID, so nothing was posted. Add a UUID on each delivery before saving.'
      );
      return;
    }

    const live = livePricing();
    setSavingAll(true);
    setSavedMessage(null);
    setErrorMessage(null);
    setMovedNotice(null);
    setSaveAllProgress(`${targets.length} items…`);

    const failed: string[] = [];
    let savedCount = 0;
    let replayCount = 0;
    let lastName = '';
    let lastOnHand = 0;
    let lastProductId: string | undefined;
    let lastUnit: RetailUnit = 'units';

    const entries = targets.map((log) => ({
      log,
      pricing: resolveLogPricing(log, live && live.id === log.id ? live : null),
    }));

    try {
      const batch = await postLogsBatchToInventory(entries, supplierId);
      if (!batch.ok) {
        setErrorMessage(batch.error || 'Batch save failed. Check the connection and try again.');
        return;
      }

      const pricingByLogId = new Map(entries.map((e) => [e.log.id, e.pricing]));

      for (const row of batch.results) {
        const logId = row.externalLogId;
        const log = logId ? targets.find((t) => t.id === logId) : undefined;
        const pricing = logId ? pricingByLogId.get(logId) : undefined;
        const label = row.itemName || log?.itemName || 'Item';

        if (!row.stock.posted) {
          failed.push(`${label} (${row.stock.reason || 'Save failed'})`);
          continue;
        }

        if (pricing && log) {
          rememberPricing(log.itemName, pricing);
          markLogPosted(log.id);
          purgeLogFromLocalSources(log.id);
        }
        if (row.stock.idempotent) replayCount += 1;
        savedCount += 1;
        lastName = label;
        lastOnHand = Number(row.stock.onHand) || 0;
        lastProductId = row.stock.productId;
        lastUnit = pricing?.retailUnit ?? 'units';
      }
    } catch {
      setErrorMessage('Batch save failed. Check the connection and try again.');
      return;
    } finally {
      setSavingAll(false);
      setSaveAllProgress(null);
    }

    if (savedCount > 0) {
      stockRequest.current += 1;
      window.dispatchEvent(new CustomEvent('freshloop-inventory-updated'));
    }

    const outcome = describeBatchSaveOutcome({
      savedCount,
      replayCount,
      failed,
      targetCount: targets.length,
    });
    if (outcome.notice) setMovedNotice(outcome.notice);
    if (outcome.error) setErrorMessage(outcome.error);
    if (outcome.savedMessage) {
      const stockHref = lastProductId
        ? `/inventory?highlight=${encodeURIComponent(lastProductId)}`
        : '/inventory';
      setMovedNotice(`__STOCK__${stockHref}__${lastName}__${formatUnits(lastOnHand)}__${lastUnit}`);
      setSavedMessage(outcome.savedMessage);
    }
  };

  return (
    <div
      className={
        embedded
          ? 'pb-[calc(4rem+var(--freshloop-mobile-nav-h))] md:pb-0'
          : 'mx-auto w-full max-w-7xl flex-1 px-3 py-5 pb-28 sm:px-6 sm:py-8'
      }
    >
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
            <span>{sheetStatusLabel(source)}</span>
            {warning ? (
              <span className="inline-flex items-center gap-1 text-slate-500">
                <AlertTriangle className="h-3 w-3" />
                {source === 'google_sheets' ? warning : 'Sample rows are not a delivery and are not saved.'}
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
              {source === 'google_sheets'
                ? 'All items processed successfully'
                : 'No delivery list to receive'}
            </p>
            <p className="mt-2 max-w-sm text-sm text-slate-400">
              {source === 'google_sheets'
                ? 'Nothing left on this delivery. Scan the next invoice or pick another shipment when it arrives.'
                : warning ||
                  'Sample rows are not loaded. Scan a real invoice, or reconnect the receiving sheet.'}
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
            'mx-auto flex max-w-3xl flex-col gap-5 pb-8 transition-opacity duration-300',
            animatingOutIds.has(selected.id) && 'opacity-90'
          )}
        >
          <InvoiceItemsCarousel
            items={listLogs}
            selectedId={selected.id}
            animatingOutIds={animatingOutIds}
            onSelect={setSelectedId}
          />

          <ReceivingPricingYieldCard
            compactHeader
            log={selected}
            packSize={packSize}
            splitFactor={splitFactor}
            packUnit={packUnit}
            yieldUnit={yieldUnit}
            caseShelfPrice={currentCaseFloor}
            currentRetailPrice={currentRetailPrice}
            marginMode={marginMode}
            customMarginPercent={customMarginPercent}
            quote={quote}
            savedPrefsHint={savedPrefsHint}
            onPackSize={(value) => {
              setPackSize(value);
              setSavedMessage(null);
            }}
            onSplitFactor={(value) => {
              setSplitFactor(value);
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
            onCaseShelfPrice={(value) => {
              floorFromMargin.current = false;
              setMarginMode('custom');
              setCurrentCaseFloor(value);
              const perUnit = perUnitFloorFromCaseFloor(toPositiveNumber(value), packNum, divNum);
              if (perUnit !== null && perUnit > 0) setCurrentRetailPrice(perUnit.toFixed(2));
              setSavedMessage(null);
            }}
            onMarginMode={applyMarginMode}
            onCustomMargin={(value) => {
              setCustomMarginPercent(value);
              setSavedMessage(null);
            }}
            onRetailFloorPrice={(value) => {
              floorFromMargin.current = false;
              setMarginMode('custom');
              setCurrentRetailPrice(value);
              const caseNext = caseFloorFromPerUnitFloor(toPositiveNumber(value), packNum, divNum);
              if (caseNext !== null && caseNext > 0) setCurrentCaseFloor(caseNext.toFixed(2));
              setSavedMessage(null);
            }}
          />

          <PackReceiptCard
            log={selected}
            retailUnit={yieldUnit}
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
      ) : null}
    </div>
  );
}
