'use client';

import React, { useCallback, useEffect, useState } from 'react';
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
import type { ReceivingLog } from '@/lib/domains/receiving/yieldPricing';
import type { SupplierRecord } from '@/lib/domains/suppliers/suppliers';

export function ReceiveScreen({ initial }: { initial: ReceivingLogsResult }) {
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [scannedLogs, setScannedLogs] = useState<ReceivingLog[]>([]);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');

  const loadSuppliers = useCallback(() => {
    void fetch('/api/admin/suppliers', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.suppliers)) {
          setSuppliers(json.suppliers as SupplierRecord[]);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const handleInvoiceImported = (result: InvoiceOcrResult) => {
    const next = receivingLogsFromInvoice(result);
    setScannedLogs(next);
    if (result.supplierId) {
      setSelectedSupplierId(result.supplierId);
    }
    setScanNote(
      next.length
        ? `${result.vendorName} · ${result.invoiceNumber} · ${next.length} cases ready to price`
        : null
    );
    setInvoiceOpen(false);
    loadSuppliers();
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
            <SupplierSelect
              suppliers={suppliers}
              value={selectedSupplierId}
              onChange={setSelectedSupplierId}
              label="Delivery supplier"
            />
            <p className="self-end text-xs text-slate-500 sm:col-span-2 lg:col-span-2">
              Applies to manual receives and invoice lines posted to inventory. OCR scans auto-match the vendor
              name to this directory.
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
