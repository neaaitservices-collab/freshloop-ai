'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Mail, Plus, Printer, Search } from 'lucide-react';
import { PoEmailPanel } from '@/components/features/orders/PoEmailPanel';
import {
  approvedOrderRows,
  caseWord,
  draftForAll,
  draftForRows,
  groupBySupplier,
  openOrderRows,
  type LineMark,
  type PoDraft,
} from '@/components/features/orders/supplierMail';
import { PageIntro } from '@/components/layout/PageIntro';
import { PageMain, ScrollTable } from '@/components/ui/layout';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Toast } from '@/components/ui/Toast';
import { formatCurrency, formatUnits, stockUnitLabel } from '@/lib/domains/receiving/yieldPricing';
import { cn } from '@/lib/utils/cn';
import { fieldMatchesNeedle } from '@/lib/utils/searchNeedle';
import { stockFromPar } from '@/lib/domains/inventory/parLevel';
import type { StockLevel } from '@/lib/domains/inventory/stock';

function casesLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function withPar(row: StockLevel, parCases: number): StockLevel {
  return {
    ...row,
    ...stockFromPar({
      onHand: row.onHand,
      casePackSize: row.casePackSize,
      unitCost: row.unitCost,
      parCases,
    }),
  };
}

function needsAttention(row: StockLevel, mark: LineMark | undefined): boolean {
  return row.low || mark === 'approved' || mark === 'sent';
}

function placeOnOrder(row: StockLevel): StockLevel {
  if (row.low && row.orderCases > 0) return row;
  const orderCases = 1;
  return {
    ...row,
    low: true,
    orderCases,
    orderCost: Number((orderCases * row.casePackSize * row.unitCost).toFixed(2)),
  };
}

function statusLabel(row: StockLevel, mark: LineMark | undefined): string {
  if (mark === 'sent') return 'On order';
  if (mark === 'approved') return 'Approved';
  if (row.low) return `Order ${row.orderCases}`;
  return 'In stock';
}

function statusVariant(row: StockLevel, mark: LineMark | undefined): BadgeVariant {
  if (mark === 'sent') return 'success';
  if (mark === 'approved') return 'ocean';
  if (row.low) return 'warning';
  return 'neutral';
}

export function BuyList({ levels: initialLevels }: { levels: StockLevel[] | null }) {
  const loading = initialLevels === null;
  const [levels, setLevels] = useState<StockLevel[]>(() => initialLevels ?? []);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, LineMark>>({});
  const [draft, setDraft] = useState<PoDraft | null>(null);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [savingSupplierId, setSavingSupplierId] = useState<string | null>(null);
  const [stockOpen, setStockOpen] = useState<Record<string, boolean>>({});
  const [quietOpen, setQuietOpen] = useState(false);
  const saveTimers = useRef<Record<string, number>>({});
  const [printedAt, setPrintedAt] = useState('');

  useEffect(() => {
    setPrintedAt(new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));
  }, []);

  useEffect(() => {
    const syncFromServer = () => {
      void fetch('/api/inventory/levels', { cache: 'no-store' })
        .then((response) => response.json())
        .then((json) => {
          if (json.success && Array.isArray(json.levels)) {
            setLevels(json.levels as StockLevel[]);
          }
        })
        .catch(() => undefined);
    };
    window.addEventListener('freshloop-inventory-updated', syncFromServer);
    return () => window.removeEventListener('freshloop-inventory-updated', syncFromServer);
  }, []);

  const draftKey = draft ? `${draft.supplier}:${draft.productIds.join(',')}` : '';

  useEffect(() => {
    if (!draftKey) return;
    document.getElementById('po-email')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [draftKey]);

  const orderingLevels = useMemo(
    () => levels.map((row) => (manualIds.includes(row.productId) ? placeOnOrder(row) : row)),
    [levels, manualIds]
  );
  const supplierChoices = useMemo(
    () => [...new Set(levels.map((row) => row.supplier))].sort((a, b) => a.localeCompare(b)),
    [levels]
  );
  const grouped = useMemo(() => groupBySupplier(orderingLevels), [orderingLevels]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return grouped;
    const next: Record<string, StockLevel[]> = {};
    for (const [supplier, rows] of Object.entries(grouped)) {
      const supplierHit = supplier.toLowerCase().includes(needle);
      const hit = supplierHit ? rows : rows.filter((row) => row.name.toLowerCase().includes(needle));
      if (hit.length > 0) next[supplier] = hit;
    }
    return next;
  }, [grouped, query]);

  const supplierNames = useMemo(() => {
    return Object.keys(filtered).sort((a, b) => {
      const aOpen = openOrderRows(filtered[a] ?? [], marks).length > 0 ? 0 : 1;
      const bOpen = openOrderRows(filtered[b] ?? [], marks).length > 0 ? 0 : 1;
      return aOpen - bOpen || a.localeCompare(b);
    });
  }, [filtered, marks]);

  const orderingNames = supplierNames.filter((supplier) =>
    (filtered[supplier] ?? []).some((row) => needsAttention(row, marks[row.productId]))
  );
  const quietNames = supplierNames.filter((supplier) => !orderingNames.includes(supplier));
  const listedNames = query.trim() ? supplierNames : orderingNames;

  const activeOrders = useMemo(
    () =>
      Object.keys(grouped)
        .map((supplier) => {
          const open = openOrderRows(grouped[supplier] ?? [], marks);
          const approved = approvedOrderRows(grouped[supplier] ?? [], marks);
          return {
            supplier,
            open,
            approved,
            suggested: open.reduce((sum, row) => sum + row.orderCost, 0),
            approvedCost: approved.reduce((sum, row) => sum + row.orderCost, 0),
          };
        })
        .filter((group) => group.open.length > 0)
        .sort((a, b) => a.supplier.localeCompare(b.supplier)),
    [grouped, marks]
  );

  const lowCount = activeOrders.reduce((sum, group) => sum + group.open.length, 0);
  const orderCost = activeOrders.reduce((sum, group) => sum + group.suggested, 0);
  const approvedCount = activeOrders.reduce((sum, group) => sum + group.approved.length, 0);

  const changePar = (productId: string, raw: string) => {
    const parCases = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(parCases)) return;
    let nextRow: StockLevel | null = null;
    setLevels((current) =>
      current.map((row) => {
        if (row.productId !== productId) return row;
        nextRow = withPar(row, parCases);
        return nextRow;
      })
    );
    window.clearTimeout(saveTimers.current[productId]);
    saveTimers.current[productId] = window.setTimeout(() => {
      if (nextRow) void savePar(nextRow);
    }, 400);
  };

  const saveSupplier = async (row: StockLevel, supplier: string) => {
    const next = supplier.trim();
    if (!next || next === row.supplier) return true;
    setSavingSupplierId(row.productId);
    setError(null);
    try {
      const response = await fetch('/api/inventory/levels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: row.productId, supplier: next }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(json.error || 'The supplier could not be saved.');
        return false;
      }
      setLevels((current) => current.map((item) => (item.productId === row.productId ? json.level : item)));
      window.dispatchEvent(new CustomEvent('freshloop-inventory-updated'));
      return true;
    } catch {
      setError('The supplier could not be saved.');
      return false;
    } finally {
      setSavingSupplierId(null);
    }
  };

  const addToOrder = (productId: string) => {
    setManualIds((current) => (current.includes(productId) ? current : [...current, productId]));
    setQuery('');
  };

  const onThisOrder = (row: StockLevel) =>
    marks[row.productId] === 'sent' || manualIds.includes(row.productId) || row.low;

  const savePar = async (row: StockLevel) => {
    setSavingId(row.productId);
    setError(null);
    try {
      const response = await fetch('/api/inventory/levels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: row.productId, parCases: row.parCases }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(json.error || 'The alert level could not be saved.');
        return;
      }
      setLevels((current) => current.map((item) => (item.productId === row.productId ? json.level : item)));
      window.dispatchEvent(new CustomEvent('freshloop-inventory-updated'));
    } catch {
      setError('The alert level could not be saved.');
    } finally {
      setSavingId(null);
    }
  };

  const rowsForPo = (group: (typeof activeOrders)[number]) =>
    group.approved.length > 0 ? group.approved : group.open;

  const approve = (productId: string) => {
    setMarks((current) => (current[productId] === 'sent' ? current : { ...current, [productId]: 'approved' }));
  };

  const approveRows = (rows: StockLevel[]) => {
    setMarks((current) => {
      const next = { ...current };
      for (const row of rows) {
        if (row.low && next[row.productId] !== 'sent') next[row.productId] = 'approved';
      }
      return next;
    });
  };

  const openDraft = (next: PoDraft) => {
    if (next.productIds.length === 0) return;
    setDraft(next);
  };

  const sendDraft = async () => {
    if (!draft || sending) return;
    setSending(true);
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    const ids = draft.productIds;
    setMarks((current) => {
      const next = { ...current };
      for (const id of ids) next[id] = 'sent';
      return next;
    });
    setToast('Order Sent Successfully');
    setDraft(null);
    setSending(false);
  };

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? levels
        .filter(
          (row) =>
            fieldMatchesNeedle(row.name, needle) ||
            fieldMatchesNeedle(row.supplier, needle)
        )
        .slice(0, 8)
    : [];

  const renderRows = (supplier: string, rows: StockLevel[]) => {
    const attention = rows.filter((row) => needsAttention(row, marks[row.productId]));
    const resting = rows.filter((row) => !needsAttention(row, marks[row.productId]));
    const showResting = attention.length === 0 || stockOpen[supplier] || query.trim().length > 0;
    const visible = showResting ? rows : attention;

    return (
      <>
        <ul className="divide-y divide-slate-800/80 md:hidden">
          {visible.map((row) => (
            <li key={row.productId} className="space-y-2 px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold leading-snug text-slate-100">{row.name}</p>
                <StatusBadge row={row} mark={marks[row.productId]} />
              </div>
              <SupplierField
                row={row}
                saving={savingSupplierId === row.productId}
                onCommit={(value) => void saveSupplier(row, value)}
              />
              <p className="font-mono text-[11px] text-slate-400">
                {formatUnits(row.onHand)} {stockUnitLabel(row.unitType)} / {casesLabel(row.onHandCases)}{' '}
                {caseWord(row.onHandCases)}
              </p>
              <div className="flex items-center justify-between gap-3">
                <OrderAmount row={row} />
                <AlertField
                  row={row}
                  saving={savingId === row.productId}
                  onChange={changePar}
                  onCommit={(value) => void savePar(withPar(row, Number(value)))}
                />
              </div>
              <LineActions
                row={row}
                mark={marks[row.productId]}
                onOrder={onThisOrder(row)}
                onAdd={() => addToOrder(row.productId)}
                onEmail={() => openDraft(draftForRows(supplier, [row]))}
                onApprove={() => approve(row.productId)}
              />
            </li>
          ))}
        </ul>
        <ScrollTable className="hidden md:block">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-950/80 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-bold">Item</th>
                <th className="px-4 py-2.5 text-right font-bold">On hand</th>
                <th className="px-4 py-2.5 text-right font-bold">Order amount</th>
                <th className="px-4 py-2.5 text-center font-bold">Alert level</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
                <th className="px-4 py-2.5 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {visible.map((row) => (
                <tr key={row.productId} className={row.low ? 'bg-amber-950/15' : undefined}>
                  <td className="px-4 py-2.5">
                    <p className="font-bold text-slate-100">{row.name}</p>
                    <SupplierField
                      row={row}
                      saving={savingSupplierId === row.productId}
                      onCommit={(value) => void saveSupplier(row, value)}
                      compact
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs text-slate-300">
                    {formatUnits(row.onHand)} {stockUnitLabel(row.unitType)}
                    <span className="block text-[11px] text-slate-500">
                      {casesLabel(row.onHandCases)} {caseWord(row.onHandCases)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <OrderAmount row={row} />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <AlertField
                      row={row}
                      saving={savingId === row.productId}
                      onChange={changePar}
                      onCommit={(value) => void savePar(withPar(row, Number(value)))}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge row={row} mark={marks[row.productId]} />
                  </td>
                  <td className="px-4 py-2.5">
                    <LineActions
                      row={row}
                      mark={marks[row.productId]}
                      onOrder={onThisOrder(row)}
                      onAdd={() => addToOrder(row.productId)}
                      onEmail={() => openDraft(draftForRows(supplier, [row]))}
                      onApprove={() => approve(row.productId)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
        {attention.length > 0 && resting.length > 0 && !query.trim() ? (
          <button
            type="button"
            onClick={() => setStockOpen((current) => ({ ...current, [supplier]: !current[supplier] }))}
            className="flex w-full items-center justify-center gap-1 border-t border-slate-800/80 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-blue-300/90"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition ${stockOpen[supplier] ? 'rotate-180' : ''}`} />
            {stockOpen[supplier] ? 'Hide in-stock items' : `Show ${resting.length} in stock`}
          </button>
        ) : null}
      </>
    );
  };

  const renderSupplier = (supplier: string) => {
    const rows = filtered[supplier] ?? [];
    const toOrder = openOrderRows(rows, marks);
    const approved = approvedOrderRows(rows, marks);
    const groupSend = approved.length > 0 ? approved : toOrder;
    const groupCost = toOrder.reduce((sum, row) => sum + row.orderCost, 0);
    return (
      <Card key={supplier} className="overflow-hidden">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{supplier}</CardTitle>
            <CardDescription>
              {toOrder.length > 0
                ? `${toOrder.length} to order · ${formatCurrency(groupCost)}`
                : 'Nothing to order'}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              className="text-xs"
              disabled={toOrder.length === 0 || approved.length === toOrder.length}
              onClick={() => approveRows(toOrder)}
            >
              <Check className="h-3.5 w-3.5" />
              Approve group
            </Button>
            <Button
              variant={approved.length > 0 ? 'success' : 'secondary'}
              className="text-xs"
              disabled={groupSend.length === 0}
              onClick={() => openDraft(draftForRows(supplier, groupSend))}
            >
              <Mail className="h-3.5 w-3.5" />
              Send group email
            </Button>
          </div>
        </CardHeader>
        {renderRows(supplier, rows)}
      </Card>
    );
  };

  return (
    <>
      <style>{`
        @media screen {
          #order-sheet { display: none !important; }
        }
        @media print {
          body * { visibility: hidden; }
          #order-sheet, #order-sheet * { visibility: visible; }
          #order-sheet {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white;
            color: black;
          }
        }
      `}</style>
      <PageMain className="bg-slate-950">
        <div className="no-print">
          <PageIntro
            step="Orders"
            title="What to buy"
            description="Search for an item and add it to the order. Change its supplier and the line moves to that supplier's list."
            action={
              <Button variant="secondary" className="text-xs" disabled={lowCount === 0} onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" />
                Print order PDF
              </Button>
            }
          />

          {error ? (
            <p className="mt-4 rounded-xl border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-sm font-semibold text-rose-400">
              {error}
            </p>
          ) : null}

          <Card
            className={cn(
              'mt-5',
              lowCount > 0 ? 'border-amber-800/40 bg-amber-950/20' : 'border-emerald-800/40 bg-emerald-950/15'
            )}
          >
            <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between py-3">
            <p className="flex items-start gap-2 text-sm font-semibold text-slate-100">
              <AlertTriangle
                className={`mt-0.5 h-4 w-4 shrink-0 ${lowCount > 0 ? 'text-amber-400/90' : 'text-emerald-400/90'}`}
              />
              <span>
                {loading
                  ? 'Reading the ledger…'
                  : lowCount > 0
                    ? `${lowCount} LOW STOCK ${lowCount === 1 ? 'ITEM' : 'ITEMS'} — ${formatCurrency(orderCost)} suggested across ${activeOrders.length} supplier${activeOrders.length === 1 ? '' : 's'}.`
                    : 'Every item is at or above its alert level.'}
              </span>
            </p>
            <Button
              variant="success"
              className="shrink-0 text-xs"
              disabled={lowCount === 0}
              onClick={() =>
                openDraft(draftForAll(activeOrders.map((group) => ({ supplier: group.supplier, rows: group.open }))))
              }
            >
              <Mail className="h-3.5 w-3.5" />
              Send bulk email
            </Button>
            </CardBody>
          </Card>

          <label className="relative mt-4 block w-full sm:max-w-sm">
            <span className="sr-only">Search orders</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search item or supplier"
              className="py-2.5 pl-9 text-sm"
            />
          </label>
          {needle ? (
            <Card className="mt-2 overflow-hidden">
              {matches.length === 0 ? (
                <CardBody className="py-4 text-sm text-slate-400">No item matches that search.</CardBody>
              ) : (
                <ul>
                {matches.map((row) => {
                  const listed = onThisOrder(row);
                  return (
                    <li
                      key={row.productId}
                      className="flex flex-col gap-2 border-b border-slate-800/80 px-4 py-3 last:border-0 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-100">{row.name}</p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {formatUnits(row.onHand)} {stockUnitLabel(row.unitType)} on hand
                        </p>
                      </div>
                      <SupplierField
                        row={row}
                        saving={savingSupplierId === row.productId}
                        onCommit={(value) => void saveSupplier(row, value)}
                      />
                      <Button
                        variant={listed ? 'secondary' : 'success'}
                        className="text-xs"
                        disabled={listed}
                        onClick={() => addToOrder(row.productId)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {listed ? 'On the order' : 'Add to order'}
                      </Button>
                    </li>
                  );
                })}
                </ul>
              )}
            </Card>
          ) : null}
          <datalist id="order-suppliers">
            {supplierChoices.map((supplier) => (
              <option key={supplier} value={supplier} />
            ))}
          </datalist>

          <div className="mt-4 grid items-start gap-4 lg:grid-cols-[3fr_1fr]">
            <div className="space-y-3">
              {loading ? (
                <Card>
                  <CardBody className="space-y-2 py-3">
                    {Array.from({ length: 6 }, (_, index) => (
                      <span key={index} className="block h-8 animate-pulse rounded-xl bg-slate-800/80" />
                    ))}
                  </CardBody>
                </Card>
              ) : null}
              {!loading && listedNames.length === 0 && quietNames.length === 0 ? (
                <Card>
                  <CardBody className="py-10 text-center text-sm text-slate-400">
                    {query.trim() ? 'Nothing matches that search.' : 'Nothing is in the catalog yet.'}
                  </CardBody>
                </Card>
              ) : null}
              {listedNames.map((supplier) => renderSupplier(supplier))}
              {!loading && !query.trim() && quietNames.length > 0 ? (
                <Card className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setQuietOpen((current) => !current)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-800/30"
                  >
                    <span>
                      <span className="block text-sm font-bold text-slate-100">In stock</span>
                      <span className="text-xs text-slate-400">
                        {quietNames.length} supplier{quietNames.length === 1 ? '' : 's'} at or above the alert level
                      </span>
                    </span>
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition ${quietOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {quietOpen ? (
                    <div className="space-y-3 border-t border-slate-800/80 p-3">{quietNames.map(renderSupplier)}</div>
                  ) : null}
                </Card>
              ) : null}
            </div>

            <aside className="space-y-3 lg:sticky lg:top-4">
              <Card>
                <CardHeader>
                  <CardTitle>Active purchase orders</CardTitle>
                  <CardDescription>
                    {approvedCount > 0
                      ? `${approvedCount} approved ${approvedCount === 1 ? 'line' : 'lines'} ready to send.`
                      : 'Approve a supplier group, then send the order.'}
                  </CardDescription>
                </CardHeader>
                <CardBody className="pt-0">
                {loading ? <p className="text-sm text-slate-500">Reading the ledger…</p> : null}
                {!loading && activeOrders.length === 0 ? (
                  <p className="text-sm text-slate-400">No open supplier orders.</p>
                ) : null}
                <ul className="space-y-2">
                  {activeOrders.map((group) => {
                    const poRows = rowsForPo(group);
                    return (
                      <li
                        key={group.supplier}
                        className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-slate-100">{group.supplier}</p>
                          <p className="font-mono text-sm font-bold text-emerald-400/90">
                            {formatCurrency(
                              group.approved.length > 0 ? group.approvedCost : group.suggested
                            )}
                          </p>
                        </div>
                        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          {group.approved.length > 0
                            ? `${group.approved.length} approved · subtotal`
                            : `${group.open.length} suggested · subtotal`}
                        </p>
                        <Button
                          variant={group.approved.length > 0 ? 'success' : 'primary'}
                          className="mt-2 w-full text-xs"
                          disabled={poRows.length === 0}
                          onClick={() => openDraft(draftForRows(group.supplier, poRows))}
                        >
                          <Mail className="h-3.5 w-3.5" />
                          {group.approved.length > 0 ? 'Send PO email' : 'Send group email'}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                </CardBody>
              </Card>
              {draft ? (
                <PoEmailPanel
                  draft={draft}
                  sending={sending}
                  onChange={setDraft}
                  onClose={() => setDraft(null)}
                  onSend={() => void sendDraft()}
                />
              ) : null}
            </aside>
          </div>
        </div>

        {loading ? null : (
          <article id="order-sheet" className="mt-8 rounded-3xl border border-zinc-800 bg-white p-6 text-zinc-950">
            <header className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-300 pb-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">FreshLoop</p>
                <h2 className="text-2xl font-black">Purchase order recommendation</h2>
                <p className="text-sm text-zinc-600">Buy list by supplier · alert level set per item</p>
              </div>
              <p className="text-sm text-zinc-600">{printedAt}</p>
            </header>
            {activeOrders.length === 0 ? (
              <p className="py-8 text-sm text-zinc-600">No cases to order.</p>
            ) : (
              activeOrders.map((group) => (
                <section key={group.supplier} className="mt-6">
                  <h3 className="text-lg font-black">{group.supplier}</h3>
                  <ScrollTable className="mt-2">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead className="text-[11px] uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="py-2">Item</th>
                        <th className="py-2 text-right">On hand</th>
                        <th className="py-2 text-right">Order</th>
                        <th className="py-2 text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.open.map((row) => (
                        <tr key={row.productId} className="border-t border-zinc-200">
                          <td className="py-2 font-semibold">{row.name}</td>
                          <td className="py-2 text-right">
                            {formatUnits(row.onHand)} {stockUnitLabel(row.unitType)}
                            <span className="block text-[11px] text-zinc-500">
                              {casesLabel(row.onHandCases)} {caseWord(row.onHandCases)}
                            </span>
                          </td>
                          <td className="py-2 text-right">
                            {row.orderCases} {caseWord(row.orderCases)}
                          </td>
                          <td className="py-2 text-right font-mono">{formatCurrency(row.orderCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-zinc-400">
                        <td className="py-2 font-bold" colSpan={3}>
                          {group.supplier} total
                        </td>
                        <td className="py-2 text-right font-mono font-bold">{formatCurrency(group.suggested)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  </ScrollTable>
                </section>
              ))
            )}
            <p className="mt-6 border-t border-zinc-300 pt-3 text-right text-base font-black">
              Order total {formatCurrency(orderCost)}
            </p>
          </article>
        )}
      </PageMain>
      <Toast message={toast} onDismiss={() => setToast(null)} variant="success" />
    </>
  );
}

function StatusBadge({ row, mark }: { row: StockLevel; mark: LineMark | undefined }) {
  return (
    <Badge variant={statusVariant(row, mark)} className="shrink-0 !normal-case !tracking-normal">
      {statusLabel(row, mark)}
    </Badge>
  );
}

function OrderAmount({ row }: { row: StockLevel }) {
  if (!row.low) return <span className="text-xs text-slate-600">—</span>;
  return (
    <span className="font-mono text-xs font-bold text-amber-400/90">
      {row.orderCases} {caseWord(row.orderCases)}
      <span className="mt-0.5 block text-[11px] text-slate-400">{formatCurrency(row.orderCost)}</span>
    </span>
  );
}

function AlertField({
  row,
  saving,
  onChange,
  onCommit,
}: {
  row: StockLevel;
  saving: boolean;
  onChange: (productId: string, raw: string) => void;
  onCommit: (raw: string) => void;
}) {
  return (
    <label className="inline-flex flex-col items-center">
      <span className="sr-only">Alert level for {row.name}</span>
      <input
        type="number"
        min={0}
        max={999}
        step={1}
        inputMode="numeric"
        aria-label={`Alert level for ${row.name}`}
        value={row.parCases}
        onChange={(event) => onChange(row.productId, event.target.value)}
        onBlur={(event) => onCommit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        className="h-8 w-14 rounded-xl border border-slate-700 bg-slate-950 text-center font-mono text-xs font-bold text-slate-100 outline-none focus:border-blue-800/80 focus:ring-1 focus:ring-blue-900/40"
      />
      {saving ? <span className="mt-0.5 text-[10px] font-bold text-slate-500">Saving</span> : null}
    </label>
  );
}

function SupplierField({
  row,
  saving,
  onCommit,
  compact,
}: {
  row: StockLevel;
  saving: boolean;
  onCommit: (value: string) => void;
  compact?: boolean;
}) {
  const [value, setValue] = useState(row.supplier);

  useEffect(() => {
    setValue(row.supplier);
  }, [row.supplier]);

  return (
    <label className={cn('block', compact ? 'mt-1 max-w-[12rem]' : 'min-w-[10rem]')}>
      <span className="sr-only">Supplier for {row.name}</span>
      <input
        list="order-suppliers"
        value={value}
        aria-label={`Supplier for ${row.name}`}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => onCommit(value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        className={cn(
          'w-full rounded-lg border border-slate-700 bg-slate-950 font-bold text-slate-200 outline-none focus:border-blue-800/80',
          compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'
        )}
      />
      {saving ? (
        <span className="mt-0.5 block text-[10px] font-bold text-slate-500">Saving supplier</span>
      ) : null}
    </label>
  );
}

function LineActions({
  row,
  mark,
  onOrder,
  onAdd,
  onEmail,
  onApprove,
}: {
  row: StockLevel;
  mark: LineMark | undefined;
  onOrder: boolean;
  onAdd: () => void;
  onEmail: () => void;
  onApprove: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Button
        variant={onOrder ? 'secondary' : 'success'}
        className="px-2 py-1 text-[11px]"
        disabled={onOrder}
        onClick={onAdd}
      >
        <Plus className="h-3 w-3" />
        {onOrder ? 'On the order' : 'Add to order'}
      </Button>
      <Button
        variant="secondary"
        className="px-2 py-1 text-[11px]"
        disabled={mark === 'sent' || !onOrder}
        onClick={onEmail}
      >
        <Mail className="h-3 w-3" />
        Send email
      </Button>
      <Button
        variant={mark === 'approved' || mark === 'sent' ? 'success' : 'secondary'}
        className="px-2 py-1 text-[11px]"
        aria-pressed={mark === 'approved' || mark === 'sent'}
        disabled={mark === 'sent' || mark === 'approved' || !row.low}
        onClick={onApprove}
      >
        <Check className="h-3 w-3" />
        {mark === 'approved' || mark === 'sent' ? 'Approved' : 'Approve'}
      </Button>
    </div>
  );
}
