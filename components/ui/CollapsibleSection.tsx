'use client';

import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export function CollapsibleSection({
  title,
  description,
  defaultOpen = false,
  children,
  className,
  anchorId,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
  /** Deep-link target (e.g. `/admin#inventory-catalog`). */
  anchorId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section
      id={anchorId}
      className={cn('rounded-2xl border border-slate-800/80 bg-slate-900/40', anchorId && 'scroll-mt-24', className)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left sm:px-5"
      >
        <span className="min-w-0">
          <span className="text-sm font-black text-slate-100">{title}</span>
          {description ? (
            <span className="mt-0.5 block text-xs leading-snug text-slate-500">{description}</span>
          ) : null}
        </span>
        <ChevronDown
          className={cn('mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open ? (
        <div id={panelId} className="border-t border-slate-800/80 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          {children}
        </div>
      ) : null}
    </section>
  );
}
