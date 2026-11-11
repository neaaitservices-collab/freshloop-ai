'use client';

import React, { useEffect, useRef } from 'react';
import type { ReceivingLog } from '@/lib/domains/receiving/yieldPricing';
import { formatCurrency } from '@/lib/domains/receiving/yieldPricing';
import { cn } from '@/lib/utils/cn';

export function InvoiceItemsCarousel({
  items,
  selectedId,
  animatingOutIds,
  onSelect,
  departmentPrompt,
}: {
  items: ReceivingLog[];
  selectedId: string | null;
  animatingOutIds: Set<string>;
  onSelect: (id: string) => void;
  departmentPrompt?: (log: ReceivingLog) => string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [selectedId]);

  if (items.length === 0) {
    return (
      <section className="min-w-0" aria-label="Recent deliveries">
        <div className="mb-2 flex items-baseline justify-between gap-2 px-0.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Recent deliveries ({items.length})
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="min-w-0" aria-label="Recent deliveries">
      <div className="mb-2 flex items-baseline justify-between gap-2 px-0.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Recent deliveries ({items.length})
        </p>
        <p className="text-[10px] text-slate-600">Swipe to browse deliveries · tap to edit</p>
      </div>
      <div
        ref={scrollRef}
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 scroll-smooth [scrollbar-width:thin]"
      >
        {items.map((log) => {
          const active = log.id === selectedId;
          const exiting = animatingOutIds.has(log.id);
          const lineTotal = Number((log.casesReceived * log.caseCost).toFixed(2));
          const prompt = departmentPrompt?.(log) ?? null;

          return (
            <button
              key={log.id}
              ref={active ? selectedRef : undefined}
              type="button"
              onClick={() => onSelect(log.id)}
              disabled={exiting}
              aria-pressed={active}
              className={cn(
                'flex min-h-[88px] w-[min(100%,17.5rem)] shrink-0 snap-center flex-col justify-between rounded-2xl border px-4 py-3 text-left transition-all duration-200',
                'active:scale-[0.98]',
                exiting && 'pointer-events-none scale-95 opacity-0',
                active
                  ? 'border-emerald-400 bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-900/20'
                  : 'border-slate-800 bg-slate-900/90 text-slate-100 hover:border-slate-600'
              )}
            >
              <span
                className={cn(
                  'line-clamp-2 text-sm font-black leading-snug',
                  active ? 'text-slate-950' : 'text-slate-100'
                )}
                title={log.itemName}
              >
                {log.itemName}
              </span>
              {prompt ? (
                <span
                  className={cn(
                    'mt-2 text-sm font-semibold leading-snug',
                    active ? 'text-slate-950' : 'text-amber-200'
                  )}
                >
                  {prompt}
                </span>
              ) : null}
              <div className="mt-2 flex items-end justify-between gap-2">
                <span
                  className={cn(
                    'text-[11px] font-bold',
                    active ? 'text-slate-800' : 'text-slate-400'
                  )}
                >
                  {log.casesReceived} {log.casesReceived === 1 ? 'case' : 'cases'}
                </span>
                <span className="text-right">
                  <span
                    className={cn(
                      'block font-mono text-base font-black tabular-nums',
                      active ? 'text-slate-900' : 'text-emerald-300/90'
                    )}
                  >
                    {formatCurrency(lineTotal)}
                  </span>
                  <span
                    className={cn(
                      'block text-[10px] font-medium tabular-nums',
                      active ? 'text-slate-700' : 'text-slate-500'
                    )}
                  >
                    {formatCurrency(log.caseCost)}/case
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
