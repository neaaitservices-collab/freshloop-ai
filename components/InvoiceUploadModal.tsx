'use client';

import React, { useState } from 'react';
import { InvoiceOcrResult } from '@/lib/types';
import { DepartmentBadge } from './DepartmentBadge';
import { FileText, Upload, Sparkles, X, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';

interface InvoiceUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvoiceImported: () => void;
}

export const InvoiceUploadModal: React.FC<InvoiceUploadModalProps> = ({
  isOpen,
  onClose,
  onInvoiceImported
}) => {
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<InvoiceOcrResult | null>(null);
  const [autoImport, setAutoImport] = useState(true);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleResetScanner = () => {
    setOcrResult(null);
    setPreviewUrl(null);
    setSelectedFile(null);
    const fileInput = document.getElementById('invoice-file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleScanInvoice = async (useDemo: boolean = false) => {
    setLoading(true);
    try {
      let imageBase64 = '';
      let mimeType = 'image/jpeg';

      if (previewUrl && !useDemo) {
        imageBase64 = previewUrl;
        mimeType = selectedFile?.type || 'image/jpeg';
      }

      const res = await fetch('/api/invoice-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mimeType,
          demo: useDemo,
          autoImport
        })
      });

      const json = await res.json();
      if (json.success && json.data) {
        setOcrResult(json.data);
        if (autoImport) {
          onInvoiceImported();
        }
      }
    } catch (err) {
      console.error('Invoice OCR scan error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">Vendor Invoice OCR Scanner</h3>
              <p className="text-xs text-zinc-400">Powered by Gemini 1.5 Flash Vision API</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-zinc-200 text-xs">
          {!ocrResult ? (
            <div className="space-y-5">
              {/* Dropzone */}
              <div className="border-2 border-dashed border-zinc-700 hover:border-emerald-500/50 rounded-2xl p-8 text-center transition-all bg-zinc-950/40 flex flex-col items-center justify-center gap-3">
                {previewUrl ? (
                  <div className="relative max-h-48 overflow-hidden rounded-xl border border-zinc-800">
                    <img src={previewUrl} alt="Invoice preview" className="max-h-48 object-contain" />
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
                  onChange={handleFileChange}
                  className="hidden"
                  id="invoice-file-input"
                />

                <label
                  htmlFor="invoice-file-input"
                  className="cursor-pointer px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs border border-zinc-700 transition-all"
                >
                  {previewUrl ? 'Change Invoice Image' : 'Select Image File'}
                </label>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800/80">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoImport}
                    onChange={(e) => setAutoImport(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/40"
                  />
                  <span className="font-semibold text-zinc-300 text-xs">
                    Auto-add extracted line items directly to floor inventory
                  </span>
                </label>

                <button
                  onClick={() => handleScanInvoice(true)}
                  disabled={loading}
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 underline"
                >
                  Use Demo Wholesale Receipt
                </button>
              </div>
            </div>
          ) : (
            /* OCR Extraction Results View */
            <div className="space-y-5">
              {ocrResult.rawSummary && ocrResult.rawSummary.includes('⚠️') && (
                <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2.5">
                  <span className="text-base">💡</span>
                  <div>
                    <span className="font-bold text-amber-300">Live AI Key Notice: </span>
                    <span>{ocrResult.rawSummary}</span>
                  </div>
                </div>
              )}

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

                <div className="text-right">
                  <span className="text-lg font-extrabold text-white">${ocrResult.totalAmount.toFixed(2)}</span>
                  <p className="text-[10px] text-emerald-400/80 font-mono">Total Verified</p>
                </div>
              </div>

              {/* Department Breakdown Pills */}
              <div>
                <h5 className="font-bold text-zinc-400 uppercase text-[10px] tracking-wider mb-2">Department Distribution</h5>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-3 rounded-xl bg-zinc-950 border border-emerald-500/30">
                    <span className="text-emerald-400 font-bold">Produce</span>
                    <p className="text-sm font-extrabold text-white mt-1">${ocrResult.departmentBreakdown.PRODUCE.toFixed(2)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-950 border border-cyan-500/30">
                    <span className="text-cyan-400 font-bold">Dairy</span>
                    <p className="text-sm font-extrabold text-white mt-1">${ocrResult.departmentBreakdown.DAIRY.toFixed(2)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-950 border border-amber-500/30">
                    <span className="text-amber-400 font-bold">Bakery</span>
                    <p className="text-sm font-extrabold text-white mt-1">${ocrResult.departmentBreakdown.BAKERY.toFixed(2)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-950 border border-purple-500/30">
                    <span className="text-purple-400 font-bold">Pantry</span>
                    <p className="text-sm font-extrabold text-white mt-1">${ocrResult.departmentBreakdown.PANTRY.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <div>
                <h5 className="font-bold text-zinc-400 uppercase text-[10px] tracking-wider mb-2">Extracted Line Items ({ocrResult.lineItems.length})</h5>
                <div className="border border-zinc-800 rounded-xl overflow-x-auto">
                  <table className="w-full text-left min-w-[340px]">
                    <thead className="bg-zinc-950 text-zinc-400 font-semibold border-b border-zinc-800 text-[11px]">
                      <tr>
                        <th className="p-2 sm:p-2.5">Item Name</th>
                        <th className="p-2 sm:p-2.5">Dept</th>
                        <th className="p-2 sm:p-2.5">Qty</th>
                        <th className="p-2 sm:p-2.5">Cost</th>
                        <th className="p-2 sm:p-2.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800 text-zinc-300 text-xs">
                      {ocrResult.lineItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-zinc-800/40">
                          <td className="p-2 sm:p-2.5 font-semibold text-white">{item.name}</td>
                          <td className="p-2 sm:p-2.5"><DepartmentBadge department={item.department} size="sm" /></td>
                          <td className="p-2 sm:p-2.5 whitespace-nowrap">{item.quantity} {item.unit}</td>
                          <td className="p-2 sm:p-2.5">${item.unitCost.toFixed(2)}</td>
                          <td className="p-2 sm:p-2.5 text-right font-bold text-white">${item.totalCost.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 sm:p-4 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between gap-2">
          <button
            onClick={handleResetScanner}
            className="px-3 sm:px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200"
          >
            {ocrResult ? 'Scan Again' : 'Reset'}
          </button>

          {!ocrResult ? (
            <button
              onClick={() => handleScanInvoice(false)}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 shadow-lg shadow-emerald-500/25 transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing with Gemini 1.5 Flash...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 fill-zinc-950" />
                  <span>Run Vision OCR Extraction</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={() => {
                onInvoiceImported();
                onClose();
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-500/20"
            >
              <span>Done & Close</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
