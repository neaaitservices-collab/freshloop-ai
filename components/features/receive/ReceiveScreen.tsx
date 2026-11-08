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
import type { ReceivingLogsResult } from '@/lib/domains/receiving/receivingSheet';
import type { InvoiceOcrResult } from '@/lib/types';
import { receivingLogsFromInvoice } from '@/lib/domains/receiving/receivingBridge';
import { SUPPLIER_REQUIRED_ERROR } from '@/lib/domains/receiving/invoiceDeliveryId';
import type { ReceivingLog } from '@/lib/domains/receiving/yieldPricing';
import type { SupplierRecord } from '@/lib/domains/suppliers/suppliers';

export function ReceiveScreen({ initial }: { initial: ReceivingLogsResult }) {
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [scannedLogs, setScannedLogs] = useState<ReceivingLog[]>([]);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [supplierLoadError, setSupplierLoadError] = useState<string | null>(null);

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
  }, [loadSuppliers]);

  const handleInvoiceImported = (result: InvoiceOcrResult) => {
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
        invoiceDate: lines[0]?.invoiceDate,
        lines: lines.map((log) => ({ printedName: log.printedName })),
      }),
    })
      .then(async (response) => {
        const json = (await response.json()) as {
          success?: boolean;
          error?: string;
          lines?: { deliveryId?: string }[];
        };
        if (cancelled) return;
        if (!response.ok || !json.success || !Array.isArray(json.lines)) {
          setScanNote(json.error ?? SUPPLIER_REQUIRED_ERROR);
          setScannedLogs((prev) =>
            prev.map((log) => (log.invoiceNumber ? { ...log, canPost: false } : log))
          );
          return;
        }
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
        if (!cancelled) setScanNote(SUPPLIER_REQUIRED_ERROR);
      });
    return () => {
      cancelled = true;
    };
    // invoiceIdentityKey already captures the printed lines. Ids assigned below must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceIdentityKey, selectedSupplierId]);

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
          <Card className="mt-3 border-emerald-800/40 bg-emerald-950/20">
            <CardBody className="py-3 text-sm font-semibold text-emerald-400/90">{scanNote}</CardBody>
          </Card>
        ) : null}
        <div className="mt-4">
          <YieldPricingDashboard
            embedded
            extraLogs={scannedLogs}
            initialLogs={initial.logs}
            initialSource={initial.source}
            initialSheetName={initial.sheetName}
            initialWarning={initial.warning}
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
