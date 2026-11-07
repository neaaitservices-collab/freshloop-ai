'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export function InventoryCatalogPagination({
  offset,
  pageSize,
  total,
  loading = false,
  onPageChange,
  className,
}: {
  offset: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPageChange: (nextOffset: number) => void;
  className?: string;
}) {
  if (total <= pageSize) return null;

  const pageIndex = Math.floor(offset / pageSize) + 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + pageSize, total);

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3',
        className
      )}
      aria-label="Catalog pagination"
    >
      <p className="text-xs font-mono tabular-nums text-slate-400">
        Showing <span className="text-slate-200">{start}</span>–<span className="text-slate-200">{end}</span> of{' '}
        <span className="text-slate-200">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={loading || offset <= 0}
          onClick={() => onPageChange(Math.max(0, offset - pageSize))}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-3 text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[5.5rem] text-center text-xs font-bold text-slate-300">
          Page {pageIndex} / {pageCount}
        </span>
        <button
          type="button"
          disabled={loading || offset + pageSize >= total}
          onClick={() => onPageChange(offset + pageSize)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-3 text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
