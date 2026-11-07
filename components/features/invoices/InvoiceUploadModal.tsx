'use client';

import React, { useCallback, useRef, useState } from 'react';
import { InvoiceOcrResult } from '@/lib/types';
import { useRole } from '@/components/auth/RoleProvider';
import { isManager } from '@/lib/utils/roles';
import { DepartmentBadge } from '@/components/ui/DepartmentBadge';
import { prepareImageDataUrlForOcr, prepareImageFileForOcr } from '@/lib/utils/prepareImageForOcr';
import { AlertTriangle, ArrowRight, Camera, CheckCircle2, FileText, ImagePlus, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ScrollTable } from '@/components/ui/layout';
import { SupplierSelect } from '@/components/features/suppliers/SupplierSelect';
import type { SupplierRecord } from '@/lib/domains/suppliers/suppliers';

interface InvoiceUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvoiceImported: (result: InvoiceOcrResult) => void;
  suppliers?: SupplierRecord[];
  selectedSupplierId?: string;
  onSupplierChange?: (supplierId: string) => void;
}

export const InvoiceUploadModal: React.FC<InvoiceUploadModalProps> = ({
  isOpen,
  onClose,
  onInvoiceImported,
  suppliers = [],
  selectedSupplierId = '',
  onSupplierChange,
}) => {
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<'prepare' | 'ocr' | null>(null);
  const scanGeneration = useRef(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<InvoiceOcrResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [managerApprovedCosts, setManagerApprovedCosts] = useState(false);
  const { activeUser } = useRole();
  const managerCanApprove = Boolean(activeUser && isManager(activeUser.role));

  const runInvoiceScan = useCallback(async (useDemo: boolean, previewDataUrl?: string | null) => {
    const generation = ++scanGeneration.current;
    if (!useDemo && !previewDataUrl) {
      setScanError('Take a photo of the invoice, or choose one from your photos.');
      return;
    }

    setLoading(true);
    setScanError(null);
    try {
      let imageBase64 = '';
      let mimeType = selectedFile?.type || 'image/jpeg';
      if (!useDemo && previewDataUrl) {
        setLoadingPhase('prepare');
        const prepared = await prepareImageDataUrlForOcr(previewDataUrl);
        if (generation !== scanGeneration.current) return;
        imageBase64 = prepared.dataUrl;
        mimeType = prepared.mimeType;
      }

      setLoadingPhase('ocr');
      const res = await fetch('/api/invoice-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: useDemo ? '' : imageBase64,
          mimeType,
          demo: useDemo,
        }),
      });

      if (generation !== scanGeneration.current) return;

      const json = await res.json();
      if (!res.ok || !json.success || !json.data?.lineItems?.length) {
        setScanError(
          (typeof json.error === 'string' && json.error) ||
            (typeof json.message === 'string' && json.message) ||
            'The invoice could not be read. Try a clearer photo.'
        );
        return;
      }
      const parsed = {
        ...(json.data as InvoiceOcrResult),
        requiresManagerApproval: Boolean(
          json.requires_manager_approval ?? json.data?.requiresManagerApproval
        ),
        flaggedItemsCount: Number(
          json.flagged_items_count ?? json.data?.flaggedItemsCount ?? 0
        ),
        guardrailThresholdPct: Number(
          json.guardrail_threshold_pct ?? json.data?.guardrailThresholdPct ?? 20
        ),
        needsManualReview: Boolean(json.needs_manual_review ?? json.data?.needsManualReview),
        lowConfidenceItemsCount: Number(
          json.low_confidence_items_count ?? json.data?.lowConfidenceItemsCount ?? 0
        ),
        ocrConfidenceThreshold: Number(
          json.ocr_confidence_threshold ?? json.data?.ocrConfidenceThreshold ?? 0.85
        ),
      };
      setOcrResult(parsed);
      if (parsed.supplierId && onSupplierChange) {
        onSupplierChange(parsed.supplierId);
      }
      setManagerApprovedCosts(false);
    } catch (err) {
      if (generation !== scanGeneration.current) return;
      console.error('Invoice OCR scan error:', err);
      setScanError('The scan did not reach the server. Check the connection and try again.');
    } finally {
      if (generation === scanGeneration.current) {
        setLoading(false);
        setLoadingPhase(null);
      }
    }
  }, [onSupplierChange, selectedFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setScanError(null);
    setOcrResult(null);
    setManagerApprovedCosts(false);
    setLoading(true);
    setLoadingPhase('prepare');
    void prepareImageFileForOcr(file)
      .then((prepared) => {
        setPreviewUrl(prepared.previewUrl);
        void runInvoiceScan(false, prepared.dataUrl);
      })
      .catch((err: unknown) => {
        console.error('Invoice image prepare error:', err);
        setScanError(
          err instanceof Error ? err.message : 'Could not prepare the photo. Try another image.'
        );
        setLoading(false);
        setLoadingPhase(null);
      });
  };

  const handleResetScanner = () => {
    setOcrResult(null);
    setPreviewUrl(null);
    setSelectedFile(null);
    setScanError(null);
    for (const id of ['invoice-file-input', 'invoice-camera-input']) {
      const fileInput = document.getElementById(id) as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
    }
  };

  const handleScanInvoice = (useDemo: boolean = false) => {
    void runInvoiceScan(useDemo, previewUrl);
  };

  const flaggedInvoice = Boolean(ocrResult?.requiresManagerApproval);
  const needsManualReviewInvoice = Boolean(ocrResult?.needsManualReview);
  const ocrThresholdPct = Math.round((ocrResult?.ocrConfidenceThreshold ?? 0.85) * 100);
  const needsManagerGate =
    flaggedInvoice && (!managerCanApprove || !managerApprovedCosts);

  const handleAddToReceiving = () => {
    if (!ocrResult || needsManagerGate) return;
    onInvoiceImported({
      ...ocrResult,
      supplierId: selectedSupplierId || ocrResult.supplierId,
    });
    onClose();
  };

  return (
    <ModalShell
      open={isOpen}
      onClose={onClose}
      width="xl"
      zIndexClass="z-[80]"
      panelClassName="max-w-3xl border-zinc-800 bg-zinc-900"
    >
        <ModalHeader className="border-zinc-800 bg-zinc-950/60 px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-bold text-lg text-white" title={ocrResult?.vendorName}>
                {ocrResult?.source === 'sample' ? 'Sample invoice' : ocrResult ? ocrResult.vendorName : 'Scan the invoice'}
              </h3>
              <p className="text-xs text-zinc-400">
                {ocrResult?.source === 'sample'
                  ? 'These lines are the practice delivery. A photo replaces them.'
                  : ocrResult
                    ? `Invoice #${ocrResult.invoiceNumber}`
                    : 'Take a photo of the vendor invoice.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-xl p-2 text-zinc-400 transition-all hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        </ModalHeader>

        <ModalBody className="space-y-6 p-6 text-xs text-zinc-200">
          {!ocrResult ? (
            <div className="space-y-5">
              {/* Dropzone */}
              <div className="border-2 border-dashed border-zinc-700 hover:border-emerald-500/50 rounded-2xl p-8 text-center transition-all bg-zinc-950/40 flex flex-col items-center justify-center gap-3">
                {previewUrl ? (
                  <div className="relative max-h-48 overflow-hidden rounded-xl border border-zinc-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="Invoice preview" className="max-h-48 object-contain" />
                    {loading ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-950/75 backdrop-blur-[1px]">
                        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
                        <p className="text-[11px] font-bold text-emerald-200">
                          {loadingPhase === 'prepare' ? 'Preparing photo…' : 'Reading line items…'}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <div className="p-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-zinc-200">Upload Vendor Delivery Invoice</p>
                      <p className="text-zinc-500 text-xs mt-1">Supports JPEG, PNG, WEBP delivery receipts & packing slips</p>
                    </div>
                  </>
                )}

                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                  id="invoice-camera-input"
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  id="invoice-file-input"
                />

                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <label
                    htmlFor="invoice-camera-input"
                    className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-xs font-black text-zinc-950"
                  >
                    <Camera className="h-4 w-4" />
                    {previewUrl ? 'Retake photo' : 'Take photo'}
                  </label>
                  <label
                    htmlFor="invoice-file-input"
                    className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-xs font-bold text-zinc-100"
                  >
                    <ImagePlus className="h-4 w-4" />
                    {previewUrl ? 'Choose another photo' : 'Choose photo'}
                  </label>
                </div>
              </div>

              {scanError ? (
                <div className="flex items-start gap-2 rounded-2xl border border-amber-500/40 bg-amber-950/50 p-3 text-xs text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <p>{scanError}</p>
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/80 p-4">
                <p className="text-xs text-zinc-400">
                  Scan starts automatically when you pick a photo. Use Read this invoice to retry.
                </p>
                <button
                  type="button"
                  onClick={() => void handleScanInvoice(true)}
                  disabled={loading}
                  className="shrink-0 text-xs font-semibold text-emerald-400 underline hover:text-emerald-300"
                >
                  Use a sample invoice
                </button>
              </div>
            </div>
          ) : (
            /* OCR Extraction Results View */
            <div className="space-y-5">
              {suppliers.length > 0 && onSupplierChange ? (
                <SupplierSelect
                  suppliers={suppliers}
                  value={selectedSupplierId}
                  onChange={onSupplierChange}
                  label="Catalog supplier for this invoice"
                />
              ) : null}
              {ocrResult.source === 'sample' ? (
                <div className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-xs text-zinc-300">
                  This list does not change until you photograph a different invoice. Use Take photo, then Read this invoice.
                </div>
              ) : null}

              {needsManualReviewInvoice ? (
                <div className="flex items-start gap-2.5 rounded-2xl border border-rose-500/40 bg-rose-950/50 p-3.5 text-xs text-rose-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                  <p>
                    <span className="font-bold text-rose-200">Low OCR confidence: </span>
                    {ocrResult.lowConfidenceItemsCount ?? 0} line(s) are below {ocrThresholdPct}%
                    extraction/match certainty. Confirm line names and catalog matches before receiving.
                  </p>
                </div>
              ) : null}

              {ocrResult.rawSummary ? (
                <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-950/60 p-3.5 text-xs text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <div>
                    <span className="font-bold text-amber-200">
                      {ocrResult.rawSummary.includes('Cost Guardrail') ? 'Cost check: ' : 'Scan note: '}
                    </span>
                    <span>{ocrResult.rawSummary.replace(/^⚠️\s*/, '')}</span>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-between p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <h4 className="font-bold text-sm text-white">{ocrResult.vendorName}</h4>
                    <p className="text-xs text-emerald-300/80">
                      Invoice #{ocrResult.invoiceNumber} • Date: {ocrResult.invoiceDate}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <span className="font-mono text-lg font-extrabold tabular-nums text-white">
                    ${ocrResult.totalAmount.toFixed(2)}
                  </span>
                  <p className="text-[10px] text-emerald-400/80 font-mono">Total Verified</p>
                </div>
              </div>

              {/* Department Breakdown Pills */}
              <div>
                <h5 className="font-bold text-zinc-400 uppercase text-[10px] tracking-wider mb-2">Department Distribution</h5>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-3 rounded-xl bg-zinc-950 border border-emerald-500/30">
                    <span className="text-emerald-400 font-bold">Produce</span>
                    <p className="mt-1 font-mono text-sm font-extrabold tabular-nums text-white">
                      ${ocrResult.departmentBreakdown.PRODUCE.toFixed(2)}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-950 border border-cyan-500/30">
                    <span className="text-cyan-400 font-bold">Dairy</span>
                    <p className="mt-1 font-mono text-sm font-extrabold tabular-nums text-white">
                      ${ocrResult.departmentBreakdown.DAIRY.toFixed(2)}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-950 border border-amber-500/30">
                    <span className="text-amber-400 font-bold">Bakery</span>
                    <p className="mt-1 font-mono text-sm font-extrabold tabular-nums text-white">
                      ${ocrResult.departmentBreakdown.BAKERY.toFixed(2)}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-950 border border-purple-500/30">
                    <span className="text-purple-400 font-bold">Pantry</span>
                    <p className="mt-1 font-mono text-sm font-extrabold tabular-nums text-white">
                      ${ocrResult.departmentBreakdown.PANTRY.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <div>
                <h5 className="font-bold text-zinc-400 uppercase text-[10px] tracking-wider mb-2">Extracted Line Items ({ocrResult.lineItems.length})</h5>
                <ScrollTable className="rounded-xl border border-zinc-800">
                  <table className="w-full min-w-[340px] text-left">
                    <thead className="bg-zinc-950 text-zinc-400 font-semibold border-b border-zinc-800 text-[11px]">
                      <tr>
                        <th className="p-2 sm:p-2.5">Item Name</th>
                        <th className="p-2 sm:p-2.5">Dept</th>
                        <th className="p-2 sm:p-2.5">Qty</th>
                        <th className="p-2 sm:p-2.5">Cost</th>
                        <th className="p-2 sm:p-2.5">Vs avg</th>
                        <th className="p-2 sm:p-2.5">OCR</th>
                        <th className="p-2 sm:p-2.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800 text-zinc-300 text-xs">
                      {ocrResult.lineItems.map((item, idx) => (
                        <tr
                          key={idx}
                          className={
                            item.needsManualReview
                              ? 'bg-rose-950/30 hover:bg-rose-950/40'
                              : item.requires_approval
                                ? (item.costVariancePct ?? 0) > 0
                                  ? 'bg-rose-950/25 hover:bg-rose-950/35'
                                  : 'bg-amber-950/30 hover:bg-amber-950/40'
                                : 'hover:bg-zinc-800/40'
                          }
                        >
                          <td className="p-2 sm:p-2.5 font-semibold text-white">
                            {item.name}
                            {item.matchedProductName && item.productId ? (
                              <p className="mt-1 text-[10px] font-normal text-emerald-300/90">
                                Catalog: {item.matchedProductName}
                                {item.matchedProductName !== item.name
                                  ? ' · pack size from receiving controls'
                                  : null}
                              </p>
                            ) : (
                              <p className="mt-1 text-[10px] font-normal text-amber-200/80">
                                No catalog match — confirm name or add SKU in Admin catalog first.
                              </p>
                            )}
                            {item.needsManualReview ? (
                              <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-rose-300">
                                Review OCR ·{' '}
                                {item.lineConfidence != null
                                  ? `${Math.round(item.lineConfidence * 100)}%`
                                  : 'low confidence'}
                              </p>
                            ) : null}
                            {item.requires_approval ? (
                              <p className="mt-1 text-[10px] font-normal text-amber-200/90">
                                {item.guardrailReason || 'Cost varies from historical average.'}
                              </p>
                            ) : null}
                          </td>
                          <td className="p-2 sm:p-2.5"><DepartmentBadge department={item.department} size="sm" /></td>
                          <td className="p-2 sm:p-2.5 whitespace-nowrap font-mono tabular-nums">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="p-2 sm:p-2.5 font-mono tabular-nums">
                            ${item.unitCost.toFixed(2)}
                          </td>
                          <td className="p-2 sm:p-2.5 whitespace-nowrap">
                            {item.costVariancePct != null ? (
                              <span
                                className={`font-mono tabular-nums ${
                                  item.requires_approval
                                    ? (item.costVariancePct ?? 0) > 0
                                      ? 'font-bold text-rose-400'
                                      : 'font-bold text-amber-300'
                                    : 'text-slate-400'
                                }`}
                              >
                                {item.costVariancePct > 0 ? '+' : ''}
                                {item.costVariancePct.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </td>
                          <td className="p-2 sm:p-2.5 whitespace-nowrap">
                            {item.lineConfidence != null ? (
                              <span
                                className={`inline-flex min-h-8 items-center rounded-lg px-2 font-mono text-[11px] font-bold tabular-nums ${
                                  item.needsManualReview
                                    ? 'border border-rose-500/40 bg-rose-950/50 text-rose-200'
                                    : 'border border-emerald-500/30 bg-emerald-950/40 text-emerald-200'
                                }`}
                              >
                                {Math.round(item.lineConfidence * 100)}%
                              </span>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </td>
                          <td className="p-2 sm:p-2.5 text-right font-mono font-bold tabular-nums text-white">
                            ${item.totalCost.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollTable>
              </div>

              {flaggedInvoice ? (
                managerCanApprove ? (
                  <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-950/40 p-4 text-xs text-amber-100">
                    <input
                      type="checkbox"
                      checked={managerApprovedCosts}
                      onChange={(e) => setManagerApprovedCosts(e.target.checked)}
                      className="mt-1 h-5 w-5 rounded border-amber-400 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>
                      <span className="font-bold text-amber-200">Manager approval: </span>
                      {(ocrResult.flaggedItemsCount ?? 0) > 0 ? (
                        <>
                          {ocrResult.flaggedItemsCount} line(s) exceed ±
                          {ocrResult.guardrailThresholdPct ?? 20}% vs moving average cost.
                        </>
                      ) : null}
                      {(ocrResult.flaggedItemsCount ?? 0) > 0 && needsManualReviewInvoice
                        ? ' '
                        : null}
                      {needsManualReviewInvoice ? (
                        <>
                          {ocrResult.lowConfidenceItemsCount ?? 0} line(s) below {ocrThresholdPct}%
                          OCR confidence.
                        </>
                      ) : null}{' '}
                      I confirm these lines before adding to receiving.
                    </span>
                  </label>
                ) : (
                  <p className="rounded-2xl border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">
                    This invoice needs store manager review
                    {(ocrResult.flaggedItemsCount ?? 0) > 0 ? ' (cost guardrail)' : ''}
                    {needsManualReviewInvoice ? ' (low OCR confidence)' : ''} before receiving.
                  </p>
                )
              ) : null}
            </div>
          )}
        </ModalBody>

        <ModalFooter className="flex items-center justify-between gap-2 border-zinc-800 bg-zinc-950/80 p-3 sm:p-4">
          <button
            type="button"
            onClick={handleResetScanner}
            className="inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 sm:min-h-12 sm:px-4"
          >
            {ocrResult ? 'Scan Again' : 'Reset'}
          </button>

          {!ocrResult ? (
            <button
              type="button"
              onClick={() => void handleScanInvoice(false)}
              disabled={loading || !previewUrl}
              className="flex min-h-12 items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-xs font-black text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>
                    {loadingPhase === 'prepare' ? 'Preparing photo…' : 'Reading the invoice…'}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Read this invoice</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAddToReceiving}
              disabled={needsManagerGate}
              title={
                needsManagerGate
                  ? 'Manager must confirm flagged costs and low-confidence OCR lines'
                  : undefined
              }
              className="flex min-h-12 items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-xs font-black text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              <span>Add {ocrResult.lineItems.length} cases to receiving</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </ModalFooter>
    </ModalShell>
  );
};
