'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  parseCsv,
  resolveImportMapping,
  type CsvSalesPreview,
} from '@/lib/domains/inventory/csvSalesParse';
import type { CsvColumnMapping } from '@/lib/security/schemas/csvSalesImport';

const FIELDS: { key: keyof CsvColumnMapping; label: string; required: boolean }[] = [
  { key: 'sku', label: 'PLU / SKU', required: true },
  { key: 'qty', label: 'Quantity', required: true },
  { key: 'unit', label: 'Unit / weight', required: true },
  { key: 'revenue', label: 'Line revenue', required: true },
  { key: 'date', label: 'Date', required: true },
  { key: 'externalRef', label: 'Receipt id', required: false },
];

type ConfirmBody = {
  posted: number;
  alreadyPosted: number;
  failed: { rowIndex: number; message: string }[];
  duplicate: number;
};

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function withColumn(current: CsvColumnMapping | null, key: keyof CsvColumnMapping, value: string): CsvColumnMapping {
  const base: CsvColumnMapping = {
    sku: current?.sku ?? '',
    qty: current?.qty ?? '',
    unit: current?.unit ?? '',
    revenue: current?.revenue ?? '',
    date: current?.date ?? '',
    externalRef: current?.externalRef,
    itemName: current?.itemName,
    variation: current?.variation,
    grossSales: current?.grossSales,
  };
  if (key === 'externalRef' || key === 'itemName' || key === 'variation' || key === 'grossSales') {
    return { ...base, [key]: value || undefined };
  }
  return { ...base, sku: key === 'sku' ? value : base.sku, qty: key === 'qty' ? value : base.qty, unit: key === 'unit' ? value : base.unit, revenue: key === 'revenue' ? value : base.revenue, date: key === 'date' ? value : base.date };
}

function PreviewSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading preview" className="mt-4 space-y-2">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-800" />
      ))}
    </div>
  );
}

function RowList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: CsvSalesPreview['rows'];
  empty: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
      <h3 className="text-sm font-black text-white">
        {title} <span className="text-slate-400">({rows.length})</span>
      </h3>
      {rows.length === 0 ? <p className="mt-2 text-sm text-slate-400">{empty}</p> : null}
      <ul className="mt-3 max-h-64 space-y-2 overflow-auto">
        {rows.slice(0, 40).map((row) => (
          <li key={`${row.status}-${row.rowIndex}`} className="rounded-xl border border-slate-800 px-3 py-2 text-sm">
            <p className="font-bold text-slate-100">
              {row.itemName || row.sku || 'Row'} {row.variation ? `· ${row.variation}` : ''}
            </p>
            <p className="text-slate-400">
              {row.saleDate ?? 'No date'}
              {row.qty != null ? ` · ${row.qty} ${row.unit}` : ''}
              {row.revenue != null ? ` · ${money(row.revenue)}` : ''}
              {row.sku ? ` · ${row.sku}` : ''}
            </p>
            {row.issues[0] ? <p className="text-rose-300">{row.issues[0]}</p> : null}
          </li>
        ))}
      </ul>
      {rows.length > 40 ? <p className="mt-2 text-xs text-slate-500">Showing 40 of {rows.length}.</p> : null}
    </section>
  );
}

export function SalesImportForm({ initialMapping }: { initialMapping: CsvColumnMapping | null }) {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<CsvColumnMapping | null>(initialMapping);
  const [preset, setPreset] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<CsvSalesPreview | null>(null);
  const [previewKey, setPreviewKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<ConfirmBody | null>(null);

  const currentKey = `${fileName}:${csv.length}:${JSON.stringify(mapping)}`;
  const previewReady = preview != null && previewKey === currentKey;

  const headerOptions = useMemo(() => headers.filter((header) => header.trim()), [headers]);

  function applyFile(text: string, name: string) {
    setCsv(text);
    setFileName(name);
    setPreview(null);
    setConfirmResult(null);
    setFieldErrors({});
    let table: string[][];
    try {
      table = parseCsv(text);
    } catch (error) {
      setHeaders([]);
      setPreset(false);
      setFormError(error instanceof Error ? error.message : 'The CSV could not be read.');
      return;
    }
    const fileHeaders = table[0] ?? [];
    setHeaders(fileHeaders);
    const resolved = resolveImportMapping(fileHeaders, initialMapping);
    if (resolved.ok && resolved.preset) {
      setPreset(true);
      setMapping(resolved.mapping);
      setFormError('');
      return;
    }
    if (!resolved.ok && resolved.error.startsWith('Missing required Square')) {
      setPreset(false);
      setMapping(null);
      setFormError(resolved.error);
      return;
    }
    setPreset(false);
    setFormError('');
    const saved = initialMapping;
    const has = (name: string | undefined) =>
      Boolean(name && fileHeaders.some((header) => header.trim().toLowerCase() === name.toLowerCase()));
    setMapping({
      sku: has(saved?.sku) ? saved!.sku : '',
      qty: has(saved?.qty) ? saved!.qty : '',
      unit: has(saved?.unit) ? saved!.unit : '',
      revenue: has(saved?.revenue) ? saved!.revenue : '',
      date: has(saved?.date) ? saved!.date : '',
      externalRef: has(saved?.externalRef) ? saved?.externalRef : undefined,
      itemName: has(saved?.itemName) ? saved?.itemName : undefined,
      variation: has(saved?.variation) ? saved?.variation : undefined,
      grossSales: has(saved?.grossSales) ? saved?.grossSales : undefined,
    });
  }

  function validateMapping(): CsvColumnMapping | null {
    if (!csv) {
      setFormError('Choose a CSV file.');
      return null;
    }
    if (!mapping || !mapping.sku || !mapping.qty || !mapping.unit || !mapping.revenue || !mapping.date) {
      const next: Record<string, string> = {};
      for (const field of FIELDS) {
        if (!field.required) continue;
        if (!mapping?.[field.key]) next[field.key] = `${field.label} is required.`;
      }
      setFieldErrors(next);
      setFormError('Map every required column.');
      return null;
    }
    setFieldErrors({});
    setFormError('');
    return mapping;
  }

  async function onPreview() {
    const bodyMapping = validateMapping();
    if (!bodyMapping) return;
    setLoading(true);
    setConfirmResult(null);
    try {
      const response = await fetch('/api/admin/sales-import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, mapping: bodyMapping }),
      });
      const body = (await response.json()) as { success?: boolean; error?: string; preview?: CsvSalesPreview };
      if (!response.ok || !body.preview) {
        setFormError(body.error ?? 'The CSV could not be previewed.');
        setPreview(null);
        return;
      }
      setMapping(body.preview.mapping);
      setPreset(body.preview.preset === 'square-items-detail');
      setPreview(body.preview);
      setPreviewKey(`${fileName}:${csv.length}:${JSON.stringify(body.preview.mapping)}`);
      setFormError('');
    } catch {
      setFormError('The CSV could not be previewed.');
    } finally {
      setLoading(false);
    }
  }

  async function onConfirm() {
    if (!previewReady || !mapping) return;
    setConfirming(true);
    try {
      const response = await fetch('/api/admin/sales-import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, mapping }),
      });
      const body = (await response.json()) as ConfirmBody & { success?: boolean; error?: string };
      if (!response.ok) {
        setFormError(body.error ?? 'The CSV could not be posted.');
        return;
      }
      setConfirmResult(body);
      setFormError('');
    } catch {
      setFormError('The CSV could not be posted.');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void onPreview();
      }}
    >
      <label className="block text-sm font-bold text-slate-200">
        Weekly CSV
        <input
          type="file"
          accept=".csv,text/csv"
          className="mt-2 block w-full text-sm text-slate-300 file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-slate-800 file:px-4 file:font-bold file:text-slate-100"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > 1_000_000) {
              setFormError('That CSV is too large. The limit is 1 MB.');
              return;
            }
            const reader = new FileReader();
            reader.onload = () => applyFile(String(reader.result ?? ''), file.name);
            reader.readAsText(file);
          }}
        />
      </label>

      {preset ? (
        <p className="rounded-xl border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
          Square Items Detail columns were recognized. Channel and Token are optional.
        </p>
      ) : null}

      {headers.length > 0 && !preset ? (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-black text-white">Column mapping</legend>
          {FIELDS.map((field) => (
            <label key={field.key} className="block text-sm font-bold text-slate-300">
              {field.label}
              {field.required ? <span className="text-rose-300"> *</span> : null}
              <select
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-base text-slate-100"
                value={mapping?.[field.key] ?? ''}
                aria-invalid={fieldErrors[field.key] ? true : undefined}
                onChange={(event) => {
                  setMapping((current) => withColumn(current, field.key, event.target.value));
                  setPreview(null);
                }}
              >
                <option value="">{field.required ? 'Choose a column' : 'Not in this file'}</option>
                {headerOptions.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
              {fieldErrors[field.key] ? <span className="mt-1 block text-rose-300">{fieldErrors[field.key]}</span> : null}
            </label>
          ))}
        </fieldset>
      ) : null}

      {formError ? (
        <p role="alert" className="rounded-xl border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-100">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" variant="primary" className="w-full sm:w-auto" disabled={loading || !csv}>
          {loading ? 'Reading…' : 'Preview'}
        </Button>
        <Button
          type="button"
          variant="success"
          className="w-full sm:w-auto"
          disabled={!previewReady || confirming || loading}
          onClick={() => void onConfirm()}
        >
          {confirming ? 'Posting…' : 'Post these sales'}
        </Button>
      </div>

      {loading ? <PreviewSkeleton /> : null}

      {preview && previewReady ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            {preview.dateRange
              ? `Dates ${preview.dateRange.from} to ${preview.dateRange.to} (Toronto).`
              : 'No readable sale dates.'}{' '}
            Nothing is posted until you confirm.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full min-w-[20rem] text-left text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-bold">Date</th>
                  <th className="px-3 py-2 font-bold">Lines</th>
                  <th className="px-3 py-2 font-bold">Qty</th>
                  <th className="px-3 py-2 font-bold">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {preview.days.map((day) => (
                  <tr key={day.date} className="border-t border-slate-800 text-slate-100">
                    <td className="px-3 py-2">{day.date}</td>
                    <td className="px-3 py-2">{day.lines}</td>
                    <td className="px-3 py-2">{day.qty}</td>
                    <td className="px-3 py-2">{money(day.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <RowList title="Matched" rows={preview.matched} empty="No lines are ready to post." />
            <RowList title="Unknown SKUs" rows={preview.unknown} empty="Every SKU is mapped." />
            <RowList title="Bad rows" rows={preview.bad} empty="No bad rows." />
            <RowList title="Already posted" rows={preview.duplicate} empty="None of these lines were posted before." />
          </div>
        </div>
      ) : null}

      {confirmResult ? (
        <p role="status" className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
          Posted {confirmResult.posted}. Already on the ledger: {confirmResult.alreadyPosted + confirmResult.duplicate}.
          {confirmResult.failed.length > 0
            ? ` ${confirmResult.failed.length} line${confirmResult.failed.length === 1 ? '' : 's'} could not post.`
            : ''}
        </p>
      ) : null}
    </form>
  );
}
