'use client';

import React, { useState } from 'react';
import type { SupplierRecord } from '@/lib/domains/suppliers/suppliers';
import {
  ADD_OCR_SUPPLIER_VALUE,
  addOcrSupplierLabel,
  supplierInvoiceSavePlan,
} from '@/lib/domains/suppliers/supplierInvoiceMatch';

/**
 * Supplier choice on the open invoice line.
 * An existing supplier is selected in place. "Add as new supplier" creates a row
 * only after the clerk confirms that option. Nothing is created by opening the list.
 */
export function InlineInvoiceSupplier({
  suppliers,
  supplierId,
  vendorName,
  onSupplierId,
  onSupplierCreated,
}: {
  suppliers: SupplierRecord[];
  supplierId: string;
  vendorName: string;
  onSupplierId: (supplierId: string) => void;
  onSupplierCreated: (supplier: SupplierRecord) => void;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addLabel = addOcrSupplierLabel(vendorName);
  const pick = choice ?? supplierId;
  const plan = supplierInvoiceSavePlan({ ocrName: vendorName, selectedSupplierId: pick });

  const onChange = (value: string) => {
    setError(null);
    setChoice(value);
    if (value && value !== ADD_OCR_SUPPLIER_VALUE) onSupplierId(value);
  };

  const confirmAdd = async () => {
    if (plan.action !== 'create' || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/receiving-suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: plan.name }),
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
      onSupplierCreated(json.supplier);
      onSupplierId(json.supplier.id);
      setChoice(null);
    } catch {
      setError('Could not add that supplier. Check the connection and try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-slate-100">
        Saved supplier for this invoice
        <select
          className="mt-1 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-slate-100"
          value={pick}
          disabled={creating}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select a supplier…</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
          {addLabel ? <option value={ADD_OCR_SUPPLIER_VALUE}>{addLabel}</option> : null}
        </select>
      </label>
      {plan.action === 'create' ? (
        <button
          type="button"
          onClick={() => void confirmAdd()}
          disabled={creating}
          className="flex min-h-11 w-full items-center justify-center rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-2.5 text-sm font-black text-emerald-100 disabled:opacity-50"
        >
          {creating ? 'Adding supplier…' : addLabel}
        </button>
      ) : null}
      {error ? <p className="text-xs font-bold text-orange-300">{error}</p> : null}
    </div>
  );
}
