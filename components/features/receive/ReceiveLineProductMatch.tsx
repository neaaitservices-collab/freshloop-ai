'use client';

import React, { useEffect, useId, useState } from 'react';

type MatchSource = 'code' | 'learned_name' | 'name';

export interface CatalogPick {
  id: string;
  name: string;
}

/**
 * Product search, match badge, and remember toggle for one receive line.
 * The search hits the active catalog. "Create new item" stays under the results.
 */
export function ReceiveLineProductMatch({
  productName,
  matchSource,
  matchPrintedValue,
  supplierName,
  supplierSaved,
  pickerOpen,
  remember,
  createNew,
  showRemember,
  onPick,
  onCreateNew,
  onChange,
  onUnlink,
  onRemember,
}: {
  productName: string | null;
  matchSource?: MatchSource | null;
  matchPrintedValue?: string | null;
  supplierName?: string | null;
  supplierSaved: boolean;
  pickerOpen: boolean;
  remember: boolean;
  createNew: boolean;
  showRemember: boolean;
  onPick: (product: CatalogPick) => void;
  onCreateNew: () => void;
  onChange: () => void;
  onUnlink: () => void;
  onRemember: (value: boolean) => void;
}) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogPick[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const badge =
    matchSource === 'code'
      ? `Matched by code${matchPrintedValue ? ` · ${matchPrintedValue}` : ''}`
      : matchSource === 'learned_name'
        ? 'Matched by saved name'
        : null;

  useEffect(() => {
    if (!pickerOpen) return;
    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      void fetch(`/api/inventory/catalog-search?q=${encodeURIComponent(query.trim())}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
        .then(async (response) => {
          const json = (await response.json()) as { success?: boolean; products?: CatalogPick[]; error?: string };
          if (!response.ok || !json.success || !Array.isArray(json.products)) {
            setSearchError(json.error || 'The catalog could not be searched.');
            setResults([]);
            return;
          }
          setResults(json.products.filter((row) => row.id && row.name));
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setSearchError('The catalog could not be searched.');
          setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 200);
    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [pickerOpen, query]);

  return (
    <div className="space-y-3 px-4 pb-3 sm:px-5">
      {productName ? (
        <p className="text-sm text-slate-200">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Product </span>
          <span className="font-semibold text-white">{productName}</span>
        </p>
      ) : null}
      {badge ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
            {badge}
          </p>
          <button type="button" className="min-h-11 rounded-xl px-3 text-sm font-bold text-slate-100" onClick={onChange}>
            Change
          </button>
          <button type="button" className="min-h-11 rounded-xl px-3 text-sm font-bold text-amber-200" onClick={onUnlink}>
            Unlink
          </button>
        </div>
      ) : productName && !pickerOpen ? (
        <button type="button" className="min-h-11 rounded-xl px-3 text-sm font-bold text-slate-100" onClick={onChange}>
          Change
        </button>
      ) : null}
      {pickerOpen ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-3">
          <label htmlFor={searchId} className="text-sm font-semibold text-slate-100">
            Search the catalog
          </label>
          <input
            id={searchId}
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type a product name"
            className="mt-2 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-sm text-slate-100"
          />
          {searching ? <p className="mt-2 text-xs text-slate-400">Searching…</p> : null}
          {searchError ? <p className="mt-2 text-xs text-rose-200">{searchError}</p> : null}
          {results.length > 0 ? (
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {results.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    className="min-h-11 w-full rounded-xl px-3 text-left text-sm font-semibold text-white hover:bg-slate-800"
                    onClick={() => onPick(product)}
                  >
                    {product.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            className="mt-2 min-h-11 w-full rounded-xl border border-slate-600 px-3 text-left text-sm text-slate-300"
            onClick={onCreateNew}
          >
            Create new item
          </button>
          {createNew ? (
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              Not in catalog yet — save posts this delivery to inventory.
            </p>
          ) : null}
        </div>
      ) : null}
      {showRemember && supplierSaved ? (
        <label className="flex min-h-11 items-center gap-3 text-sm text-slate-100">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => onRemember(event.target.checked)}
          />
          Remember for {supplierName?.trim() || 'this supplier'}
        </label>
      ) : null}
    </div>
  );
}
