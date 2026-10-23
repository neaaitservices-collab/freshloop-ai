'use client';

import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PageIntro } from '@/components/layout/PageIntro';
import { YieldPricingDashboard } from '@/components/features/receive/YieldPricingDashboard';
import { InvoiceUploadModal } from '@/components/features/invoices/InvoiceUploadModal';
import type { ReceivingLogsResult } from '@/lib/domains/receiving/receivingSheet';
import type { InvoiceOcrResult } from '@/lib/types';
import { receivingLogsFromInvoice } from '@/lib/domains/receiving/receivingBridge';
import type { ReceivingLog } from '@/lib/domains/receiving/yieldPricing';

export function ReceiveScreen({ initial }: { initial: ReceivingLogsResult }) {
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [scannedLogs, setScannedLogs] = useState<ReceivingLog[]>([]);
  const [scanNote, setScanNote] = useState<string | null>(null);

  const handleInvoiceImported = (result: InvoiceOcrResult) => {
    const next = receivingLogsFromInvoice(result);
    setScannedLogs(next);
    setScanNote(
      next.length
        ? `${result.vendorName} · ${result.invoiceNumber} · ${next.length} cases ready to price`
        : null
    );
    setInvoiceOpen(false);
  };

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-8">
        <PageIntro
          step="Step 1 · Receive"
          title="Price the delivery"
          description="Pick a case, set the yield and the floor price, then save it into inventory."
          action={
            <button
              type="button"
              onClick={() => setInvoiceOpen(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-zinc-950 sm:w-auto"
            >
              <FileText className="h-4 w-4" />
              Scan invoice
            </button>
          }
        />
        {scanNote ? (
          <p className="mt-3 rounded-2xl border border-emerald-500/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200">
            {scanNote}
          </p>
        ) : null}
        <div className="mt-4">
          <YieldPricingDashboard
            embedded
            extraLogs={scannedLogs}
            initialLogs={initial.logs}
            initialSource={initial.source}
            initialSheetName={initial.sheetName}
            initialWarning={initial.warning}
            onScanNext={() => setInvoiceOpen(true)}
            onLogDisposition={(logId) =>
              setScannedLogs((prev) => prev.filter((log) => log.id !== logId))
            }
          />
        </div>
      </main>
      <InvoiceUploadModal
        isOpen={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        onInvoiceImported={handleInvoiceImported}
      />
    </AppShell>
  );
}
