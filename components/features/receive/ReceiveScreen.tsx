'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { PageIntro } from '@/components/layout/PageIntro';
import { YieldPricingDashboard } from '@/components/features/receive/YieldPricingDashboard';
import { InvoiceUploadModal } from '@/components/features/invoices/InvoiceUploadModal';
import { SupplierSelect } from '@/components/features/suppliers/SupplierSelect';
import { PageMain } from '@/components/ui/layout';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import type { ReceivingDeliveryListResult } from '@/lib/domains/receiving/receivingDeliveries';
import type { InvoiceOcrResult } from '@/lib/types';
import { restoredScanLogs, type RestoredInvoiceScan } from '@/lib/domains/receiving/openInvoiceScan';
import {
  applyOpenScanChoice,
  clearOpenScanChoice,
  readOpenScanChoice,
  rememberOpenScanChoice,
} from '@/lib/domains/receiving/openInvoiceScanChoice';
import {
  consumeStashedReceivingScan,
  receivingLogsFromInvoice,
} from '@/lib/domains/receiving/receivingBridge';
import {
  INVOICE_IDENTITY_NETWORK_ERROR,
  SUPPLIER_REQUIRED_ERROR,
} from '@/lib/domains/receiving/invoiceDeliveryId';
import {
  clearedInvoiceIdentity,
  firstRenamePair,
  identityHoldFromResponse,
  type IdentityHoldState,
  type InvoiceHoldAction,
} from '@/lib/domains/receiving/invoiceIdentityHold';
import {
  applyServerDeliveryIds,
  clearInvoiceDeliveryIds,
  type InvoiceIdentityPhase,
} from '@/lib/domains/receiving/invoiceReceiveSave';
import { InvoiceIdentityActions } from '@/components/features/receive/InvoiceIdentityActions';
import type { ReceivingLog } from '@/lib/domains/receiving/yieldPricing';
import type { SupplierRecord } from '@/lib/domains/suppliers/suppliers';
import {
  receivingDepartment,
  type ReceivingDepartment,
} from '@/lib/domains/inventory/receivingDepartment';
import { useDepartmentOptions } from '@/hooks/use-department-options';

export function ReceiveScreen({
  initial,
  openScan = null,
}: {
  initial: ReceivingDeliveryListResult;
  openScan?: RestoredInvoiceScan | null;
}) {
  const restoredLogs = openScan ? restoredScanLogs(openScan) : [];
  const openScanDraftId = openScan?.draftId?.trim() ?? '';
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [scannedLogs, setScannedLogs] = useState<ReceivingLog[]>(restoredLogs);
  const [scanNote, setScanNote] = useState<string | null>(
    restoredLogs.length ? SUPPLIER_REQUIRED_ERROR : null
  );
  const [discarding, setDiscarding] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [screenDepartment, setScreenDepartment] = useState<ReceivingDepartment | ''>('');
  const departmentOptions = useDepartmentOptions();
  const [supplierLoadError, setSupplierLoadError] = useState<string | null>(null);
  const [identityNonce, setIdentityNonce] = useState(0);
  const [identityHold, setIdentityHold] = useState<IdentityHoldState | null>(null);
  const [identityPhase, setIdentityPhase] = useState<InvoiceIdentityPhase>('idle');
  const [scanVendorName, setScanVendorName] = useState(openScan?.vendorName?.trim() ?? '');
  const [dateDraft, setDateDraft] = useState('');

  const loadSuppliers = useCallback(() => {
    setSupplierLoadError(null);
    void fetch('/api/admin/suppliers', { cache: 'no-store' })
      .then(async (r) => {
        const json = (await r.json()) as {
          success?: boolean;
          suppliers?: SupplierRecord[];
          error?: string;
        };
        if (!r.ok || !json.success || !Array.isArray(json.suppliers)) {
          setSupplierLoadError(json.error ?? 'Could not load suppliers.');
          return;
        }
        setSuppliers(json.suppliers);
      })
      .catch((err: unknown) => {
        setSupplierLoadError('Network error — supplier list may be incomplete.');
        console.error('[freshloop] ReceiveScreen loadSuppliers', err);
      });
  }, []);

  useEffect(() => {
    loadSuppliers();
    const stashed = consumeStashedReceivingScan();
    if (!stashed?.logs.length) {
      const choice = readOpenScanChoice();
      if (choice && openScanDraftId && choice.draftId === openScanDraftId) {
        if (choice.supplierId) setSelectedSupplierId(choice.supplierId);
        if (choice.manualReviewOverride) {
          setScannedLogs((prev) => applyOpenScanChoice(prev, choice));
        }
      } else if (choice) {
        clearOpenScanChoice();
      }
      return;
    }
    const cleared = clearedInvoiceIdentity();
    setDateDraft(cleared.dateDraft);
    setIdentityHold(cleared.identityHold);
    setIdentityPhase(stashed.supplierId ? 'loading' : 'idle');
    setScanVendorName(stashed.vendorName);
    if (stashed.supplierId) setSelectedSupplierId(stashed.supplierId);
    setScannedLogs(stashed.logs);
    setScanNote(stashed.note);
    const stashedDraftId = stashed.logs.find((log) => log.draftId)?.draftId;
    if (stashedDraftId) {
      rememberOpenScanChoice({
        draftId: stashedDraftId,
        supplierId: stashed.supplierId,
        manualReviewOverride: stashed.logs.some((log) => log.manualReviewOverride),
      });
    }
  }, [loadSuppliers, openScanDraftId]);

  const handleInvoiceImported = (result: InvoiceOcrResult) => {
    const cleared = clearedInvoiceIdentity();
    setDateDraft(cleared.dateDraft);
    setIdentityHold(cleared.identityHold);
    setScanVendorName(result.vendorName?.trim() ?? '');
    const next = receivingLogsFromInvoice(result);
    setScannedLogs(next);
    if (result.supplierId) setSelectedSupplierId(result.supplierId);
    setIdentityPhase(result.supplierId ? 'loading' : 'idle');
    setScanNote(
      next.length
        ? result.supplierId
          ? `${result.vendorName} · ${result.invoiceNumber} · identifying lines for the saved supplier`
          : SUPPLIER_REQUIRED_ERROR
        : null
    );
    if (result.draftId?.trim()) {
      rememberOpenScanChoice({
        draftId: result.draftId.trim(),
        supplierId: result.supplierId ?? '',
        manualReviewOverride: Boolean(result.manualReviewOverride),
      });
    }
    setInvoiceOpen(false);
    loadSuppliers();
  };

  const invoiceIdentityKey = useMemo(
    () =>
      scannedLogs
        .filter((log) => log.invoiceNumber && log.printedName)
        .map((log) => `${log.invoiceNumber}\n${log.invoiceDate ?? ''}\n${log.printedName}`)
        .join('\n---\n'),
    [scannedLogs]
  );

  useEffect(() => {
    if (!invoiceIdentityKey) {
      setIdentityPhase('idle');
      return;
    }
    if (!selectedSupplierId) {
      setIdentityPhase('idle');
      setIdentityHold(null);
      setScanNote(SUPPLIER_REQUIRED_ERROR);
      setScannedLogs((prev) => clearInvoiceDeliveryIds(prev));
      return;
    }
    setIdentityPhase('loading');
    setIdentityHold(null);
    setScannedLogs((prev) => clearInvoiceDeliveryIds(prev));
    const lines = scannedLogs.filter((log) => log.invoiceNumber && log.printedName);
    const invoiceNumber = lines[0]?.invoiceNumber;
    if (!invoiceNumber) return;
    let cancelled = false;
    void fetch('/api/receiving-invoices/identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplierId: selectedSupplierId,
        invoiceNumber,
        invoiceDate: dateDraft || lines[0]?.invoiceDate,
        lines: lines.map((log) => ({ printedName: log.printedName })),
      }),
    })
      .then(async (response) => {
        const json = (await response.json()) as {
          success?: boolean;
          error?: string;
          code?: string;
          lines?: { deliveryId?: string; ordinal?: number }[];
          identifiedLines?: { deliveryId?: string; ordinal?: number }[];
          newPrintedNames?: string[];
          legacyReceipts?: { key: string; vendor: string; invoice: string }[];
          unmatchedStoredLines?: { id: string; printedKey: string }[];
        };
        if (cancelled) return;
        if (!response.ok || !json.success || !Array.isArray(json.lines)) {
          const hold = identityHoldFromResponse(json);
          setIdentityHold(hold);
          setIdentityPhase(hold ? 'held' : 'failed');
          setScanNote(json.error ?? SUPPLIER_REQUIRED_ERROR);
          setScannedLogs((prev) => applyServerDeliveryIds(prev, json.identifiedLines ?? []));
          return;
        }
        setIdentityHold(null);
        setIdentityPhase('ready');
        setScannedLogs((prev) => applyServerDeliveryIds(prev, json.lines));
        setScanNote(
          `Invoice ${invoiceNumber} is tied to the selected supplier. A rescan reuses these delivery ids and does not add a second receipt.`
        );
      })
      .catch(() => {
        if (cancelled) return;
        setIdentityPhase('failed');
        setScanNote(INVOICE_IDENTITY_NETWORK_ERROR);
        setIdentityHold(null);
        setScannedLogs((prev) => applyServerDeliveryIds(prev, []));
      });
    return () => {
      cancelled = true;
    };
    // invoiceIdentityKey already captures the printed lines. Ids assigned below must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateDraft, identityNonce, invoiceIdentityKey, selectedSupplierId]);

  const changeSupplier = (supplierId: string) => {
    setSelectedSupplierId(supplierId);
    setIdentityHold(null);
    setScannedLogs((prev) => clearInvoiceDeliveryIds(prev));
    const draftId = scannedLogs.find((log) => log.draftId)?.draftId;
    if (draftId) {
      rememberOpenScanChoice({
        draftId,
        supplierId,
        manualReviewOverride: scannedLogs.some((log) => log.manualReviewOverride),
      });
    }
    if (!supplierId || !invoiceIdentityKey) {
      setIdentityPhase('idle');
      if (!supplierId && invoiceIdentityKey) setScanNote(SUPPLIER_REQUIRED_ERROR);
      return;
    }
    setIdentityPhase('loading');
  };

  const confirmHold = (action: InvoiceHoldAction['action'], legacyKey?: string) => {
    const lines = scannedLogs.filter((log) => log.invoiceNumber && log.printedName);
    const invoiceNumber = lines[0]?.invoiceNumber;
    if (!selectedSupplierId || !invoiceNumber) return;
    const pair = identityHold ? firstRenamePair(identityHold) : null;
    void fetch('/api/receiving-invoices/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        supplierId: selectedSupplierId,
        invoiceNumber,
        invoiceDate: dateDraft || lines[0]?.invoiceDate,
        lines: lines.map((log) => ({ printedName: log.printedName })),
        confirmNewPrintedNames: identityHold?.newPrintedNames,
        legacyKey,
        fromLineId: action === 'map-line' ? pair?.fromLineId : undefined,
        mappedPrintedName: action === 'map-line' ? pair?.mappedPrintedName : undefined,
      }),
    })
      .then(async (response) => {
        const json = (await response.json()) as {
          success?: boolean;
          error?: string;
          code?: string;
          storedDates?: string[];
          newPrintedNames?: string[];
          legacyReceipts?: { key: string; vendor: string; invoice: string }[];
          unmatchedStoredLines?: { id: string; printedKey: string }[];
        };
        if (response.status === 403) {
          setScanNote(json.error ?? 'Only a store manager or the owner can confirm this invoice match.');
          return;
        }
        if (!response.ok || !json.success) {
          setIdentityHold(identityHoldFromResponse(json));
          setScanNote(json.error ?? 'That confirmation was not saved.');
          return;
        }
        setIdentityHold(null);
        setIdentityNonce((value) => value + 1);
      })
      .catch(() => setScanNote('That confirmation did not reach the server.'));
  };

  const openDraftId = scannedLogs.find((log) => log.draftId)?.draftId ?? '';

  const forgetStoredScan = async (draftId: string) => {
    if (!draftId) {
      clearOpenScanChoice();
      return true;
    }
    const response = await fetch('/api/receiving-invoices/open-draft', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId }),
    });
    if (!response.ok && response.status !== 404 && response.status !== 409) return false;
    clearOpenScanChoice();
    return true;
  };

  const closeOpenDraft = async (draftId: string) => {
    try {
      const cleared = await forgetStoredScan(draftId);
      if (!cleared) {
        setScanNote('The scan could not be discarded. It may still be here after a refresh.');
      }
    } catch {
      setScanNote('The scan could not be discarded. It may still be here after a refresh.');
    }
  };

  const discardScan = async () => {
    if (!openDraftId || discarding) return;
    setDiscarding(true);
    try {
      const cleared = await forgetStoredScan(openDraftId);
      if (!cleared) {
        setScanNote('The scan could not be discarded. It may still be here after a refresh.');
        return;
      }
      setScannedLogs([]);
      setScanVendorName('');
      setIdentityHold(null);
      setIdentityPhase('idle');
      setDateDraft('');
      setScanNote(null);
    } catch {
      setScanNote('The scan could not be discarded. It may still be here after a refresh.');
    } finally {
      setDiscarding(false);
    }
  };

  return (
    <>
      <PageMain className="bg-slate-950 py-4 sm:py-8">
        <PageIntro
          step="Step 1 · Receive"
          title="Price the delivery"
          description="Pick a line from the carousel, set yield and floor price, then save one item or the whole invoice."
          action={
            <Button variant="success" className="w-full sm:w-auto py-3" onClick={() => setInvoiceOpen(true)}>
              <FileText className="h-4 w-4" />
              Scan invoice
            </Button>
          }
        />
        <Card className="mt-4 border-slate-800 bg-slate-900/40">
          <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {supplierLoadError ? (
              <p className="sm:col-span-2 lg:col-span-3 rounded-xl border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
                {supplierLoadError}
              </p>
            ) : null}
            <div>
              <SupplierSelect
                suppliers={suppliers}
                value={selectedSupplierId}
                onChange={changeSupplier}
                label="Delivery supplier"
              />
              <AddReceiveSupplier
                onCreated={(supplier) => {
                  setSuppliers((current) =>
                    current.some((row) => row.id === supplier.id)
                      ? current
                      : [...current, supplier].sort((a, b) => a.name.localeCompare(b.name))
                  );
                  changeSupplier(supplier.id);
                }}
              />
            </div>
            <label className="block text-sm text-slate-300">
              Department when the item is unclear
              <select
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-100"
                value={screenDepartment}
                onChange={(event) => setScreenDepartment(receivingDepartment(event.target.value) ?? '')}
              >
                <option value="">Choose on each unclear line</option>
                {departmentOptions.map((dept) => (
                  <option key={dept.code} value={dept.code}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="self-end text-xs text-slate-500 sm:col-span-2 lg:col-span-3">
              Invoice lines stay blocked until you pick a saved supplier. The printed vendor name is not used as
              the receipt identity. {SUPPLIER_REQUIRED_ERROR} Dairy, bakery, pantry, produce, and deli names are
              classified from the line. This pick is used only when the line does not say.
            </p>
          </CardBody>
        </Card>
        {scanNote ? (
          <Card className={`mt-3 ${identityHold ? 'border-amber-800/50 bg-amber-950/20' : 'border-emerald-800/40 bg-emerald-950/20'}`}>
            <CardBody className="space-y-3 py-3 text-sm">
              <p className={identityHold ? 'font-semibold text-amber-100' : 'font-semibold text-emerald-400/90'}>
                {scanNote}
              </p>
              {identityHold ? (
                <InvoiceIdentityActions
                  hold={identityHold}
                  dateDraft={dateDraft}
                  onDateDraft={setDateDraft}
                  onConfirm={confirmHold}
                />
              ) : null}
              {openDraftId ? (
                <Button variant="secondary" className="py-2 text-xs" disabled={discarding} onClick={() => void discardScan()}>
                  {discarding ? 'Discarding scan…' : 'Discard scan'}
                </Button>
              ) : null}
            </CardBody>
          </Card>
        ) : null}
        <div className="mt-4">
          <YieldPricingDashboard
            embedded
            extraLogs={scannedLogs}
            initialLogs={initial.logs}
            initialWarning={initial.warning}
            supplierId={selectedSupplierId || undefined}
            supplierName={suppliers.find((row) => row.id === selectedSupplierId)?.name}
            suppliers={suppliers}
            vendorName={scanVendorName}
            identityPhase={identityPhase}
            identityHold={identityHold}
            identityMessage={identityHold?.error ?? (identityPhase === 'failed' ? scanNote : null)}
            invoiceDateDraft={dateDraft}
            onInvoiceDateDraft={setDateDraft}
            onSupplierId={changeSupplier}
            onSupplierCreated={(supplier) => {
              setSuppliers((current) =>
                current.some((row) => row.id === supplier.id)
                  ? current
                  : [...current, supplier].sort((a, b) => a.name.localeCompare(b.name))
              );
            }}
            onConfirmIdentity={confirmHold}
            screenDepartment={screenDepartment || undefined}
            onScanNext={() => setInvoiceOpen(true)}
            onLogDisposition={(logId) =>
              setScannedLogs((prev) => prev.filter((log) => log.id !== logId))
            }
            onOpenDraftCleared={(draftId) => closeOpenDraft(draftId)}
          />
        </div>
      </PageMain>
      <InvoiceUploadModal
        isOpen={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        onInvoiceImported={handleInvoiceImported}
        suppliers={suppliers}
        selectedSupplierId={selectedSupplierId}
        onSupplierChange={setSelectedSupplierId}
        onSupplierCreated={(supplier) => {
          setSuppliers((current) =>
            current.some((row) => row.id === supplier.id)
              ? current
              : [...current, supplier].sort((a, b) => a.name.localeCompare(b.name))
          );
        }}
      />
    </>
  );
}

/** Receiving staff add a supplier by name without the manager supplier directory. */
function AddReceiveSupplier({ onCreated }: { onCreated: (supplier: SupplierRecord) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const next = name.trim();
    if (!next) {
      setError('Supplier name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/receiving-suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: next }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        supplier?: SupplierRecord;
        error?: string;
      };
      if (!res.ok || !json.success || !json.supplier?.id) {
        setError(json.error || 'Could not add that supplier.');
        return;
      }
      onCreated(json.supplier);
      setName('');
      setOpen(false);
    } catch {
      setError('Could not add that supplier. Check the connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button type="button" variant="secondary" className="mt-2" onClick={() => setOpen(true)}>
        Add supplier
      </Button>
    );
  }

  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="block text-xs font-bold text-slate-400">
        Supplier name
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-1 w-full min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
        />
      </label>
      {error ? <p className="text-sm text-amber-200">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="success" disabled={saving}>
          {saving ? 'Saving…' : 'Save supplier'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
