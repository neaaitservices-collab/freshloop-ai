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
import type { RecordedReceivingLogs } from '@/lib/domains/receiving/receivingDeliveries';
import type { InvoiceOcrResult } from '@/lib/types';
import { consumeStashedReceivingScan, receivingLogsFromInvoice } from '@/lib/domains/receiving/receivingBridge';
import { SUPPLIER_REQUIRED_ERROR } from '@/lib/domains/receiving/invoiceDeliveryId';
import {
  clearedInvoiceIdentity,
  identityHoldFromResponse,
  invoiceHoldActions,
  type IdentityHoldState,
  type InvoiceHoldAction,
} from '@/lib/domains/receiving/invoiceIdentityHold';
import type { ReceivingLog } from '@/lib/domains/receiving/yieldPricing';
import type { SupplierRecord } from '@/lib/domains/suppliers/suppliers';

export function ReceiveScreen({ initial }: { initial: RecordedReceivingLogs }) {
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [scannedLogs, setScannedLogs] = useState<ReceivingLog[]>([]);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [supplierLoadError, setSupplierLoadError] = useState<string | null>(null);
  const [identityNonce, setIdentityNonce] = useState(0);
  const [identityHold, setIdentityHold] = useState<IdentityHoldState | null>(null);
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
    if (!stashed?.logs.length) return;
    const cleared = clearedInvoiceIdentity();
    setDateDraft(cleared.dateDraft);
    setIdentityHold(cleared.identityHold);
    setScannedLogs(stashed.logs);
    setScanNote(stashed.note);
  }, [loadSuppliers]);

  const handleInvoiceImported = (result: InvoiceOcrResult) => {
    const cleared = clearedInvoiceIdentity();
    setDateDraft(cleared.dateDraft);
    setIdentityHold(cleared.identityHold);
    const next = receivingLogsFromInvoice(result);
    setScannedLogs(next);
    if (result.supplierId) setSelectedSupplierId(result.supplierId);
    setScanNote(
      next.length
        ? result.supplierId
          ? `${result.vendorName} · ${result.invoiceNumber} · identifying lines for the saved supplier`
          : SUPPLIER_REQUIRED_ERROR
        : null
    );
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
    if (!invoiceIdentityKey) return;
    if (!selectedSupplierId) {
      setScanNote(SUPPLIER_REQUIRED_ERROR);
      return;
    }
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
          lines?: { deliveryId?: string }[];
          newPrintedNames?: string[];
          legacyReceipts?: { key: string; vendor: string; invoice: string }[];
          unmatchedStoredLines?: { id: string; printedKey: string }[];
        };
        if (cancelled) return;
        if (!response.ok || !json.success || !Array.isArray(json.lines)) {
          setIdentityHold(identityHoldFromResponse(json));
          setScanNote(json.error ?? SUPPLIER_REQUIRED_ERROR);
          setScannedLogs((prev) =>
            prev.map((log) => (log.invoiceNumber ? { ...log, canPost: false } : log))
          );
          return;
        }
        setIdentityHold(null);
        setScannedLogs((prev) => {
          let cursor = 0;
          return prev.map((log) => {
            if (!log.invoiceNumber || !log.printedName) return log;
            const assigned = json.lines?.[cursor];
            cursor += 1;
            if (!assigned?.deliveryId) return { ...log, canPost: false };
            return { ...log, id: assigned.deliveryId, canPost: true };
          });
        });
        setScanNote(
          `Invoice ${invoiceNumber} is tied to the selected supplier. A rescan reuses these delivery ids and does not add a second receipt.`
        );
      })
      .catch(() => {
        if (cancelled) return;
        setScanNote(SUPPLIER_REQUIRED_ERROR);
        setIdentityHold(null);
        setScannedLogs((prev) =>
          prev.map((log) => (log.invoiceNumber ? { ...log, canPost: false } : log))
        );
      });
    return () => {
      cancelled = true;
    };
    // invoiceIdentityKey already captures the printed lines. Ids assigned below must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateDraft, identityNonce, invoiceIdentityKey, selectedSupplierId]);

  const confirmHold = (action: InvoiceHoldAction['action'], legacyKey?: string) => {
    const lines = scannedLogs.filter((log) => log.invoiceNumber && log.printedName);
    const invoiceNumber = lines[0]?.invoiceNumber;
    if (!selectedSupplierId || !invoiceNumber) return;
    const mapped = identityHold?.unmatchedStoredLines?.[0];
    const newName = identityHold?.newPrintedNames?.[0];
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
        fromLineId: action === 'map-line' ? mapped?.id : undefined,
        mappedPrintedName: action === 'map-line' ? newName : undefined,
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
            <SupplierSelect
              suppliers={suppliers}
              value={selectedSupplierId}
              onChange={setSelectedSupplierId}
              label="Delivery supplier"
            />
            <p className="self-end text-xs text-slate-500 sm:col-span-2 lg:col-span-2">
              Invoice lines stay blocked until you pick a saved supplier. The printed vendor name is not used as
              the receipt identity. {SUPPLIER_REQUIRED_ERROR}
            </p>
          </CardBody>
        </Card>
        {scanNote ? (
          <Card className={`mt-3 ${identityHold ? 'border-amber-800/50 bg-amber-950/20' : 'border-emerald-800/40 bg-emerald-950/20'}`}>
            <CardBody className="space-y-3 py-3 text-sm">
              <p className={identityHold ? 'font-semibold text-amber-100' : 'font-semibold text-emerald-400/90'}>
                {scanNote}
              </p>
              {identityHold?.code === 'DATE_REQUIRED' ? (
                <label className="block text-xs text-slate-300">
                  Invoice date from the paper
                  <input
                    value={dateDraft}
                    onChange={(event) => setDateDraft(event.target.value)}
                    placeholder="YYYY-MM-DD"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </label>
              ) : null}
              {identityHold ? (
                <div className="flex flex-wrap gap-2">
                  {invoiceHoldActions(identityHold.code)
                    .filter((choice) => choice.action !== 'map-line' || (identityHold.unmatchedStoredLines?.length === 1 && identityHold.newPrintedNames?.length === 1))
                    .filter((choice) => choice.action !== 'adopt-legacy')
                    .map((choice) => (
                      <Button key={choice.action} type="button" variant="secondary" onClick={() => confirmHold(choice.action)}>
                        {choice.label}
                      </Button>
                    ))}
                  {identityHold.code === 'LEGACY_RECEIPT_PRESENT'
                    ? (identityHold.legacyReceipts ?? []).map((receipt) => (
                        <Button
                          key={receipt.key}
                          type="button"
                          variant="secondary"
                          onClick={() => confirmHold('adopt-legacy', receipt.key)}
                        >
                          Store manager: attach {receipt.vendor} / {receipt.invoice} without adding stock
                        </Button>
                      ))
                    : null}
                </div>
              ) : null}
            </CardBody>
          </Card>
        ) : null}
        <div className="mt-4">
          <YieldPricingDashboard
            embedded
            extraLogs={scannedLogs}
            initialLogs={initial.logs}
            supplierId={selectedSupplierId || undefined}
            onScanNext={() => setInvoiceOpen(true)}
            onLogDisposition={(logId) =>
              setScannedLogs((prev) => prev.filter((log) => log.id !== logId))
            }
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
      />
    </>
  );
}
