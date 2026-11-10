'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { nextFocusIndex } from '@/lib/ui/dialogFocus';
import { cn } from '@/lib/utils/cn';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.tabIndex >= 0
  );
}

const PANEL_WIDTH = {
  sm: 'max-w-lg',
  md: 'max-w-2xl',
  lg: 'max-w-3xl',
  xl: 'max-w-4xl',
  full: 'max-w-[min(100%,56rem)]',
} as const;

export function ModalShell({
  open,
  onClose,
  children,
  zIndexClass = 'z-50',
  width = 'lg',
  panelClassName,
  overlayClassName,
  labelledBy,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  zIndexClass?: string;
  width?: keyof typeof PANEL_WIDTH;
  panelClassName?: string;
  overlayClassName?: string;
  /** id of the visible title. Falls back to `label` or "Dialog". */
  labelledBy?: string;
  label?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const items = panel ? focusableIn(panel) : [];
    (items[0] ?? panel)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const current = focusableIn(panel);
      if (current.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const index = current.indexOf(document.activeElement as HTMLElement);
      const next = nextFocusIndex(current.length, index, event.shiftKey);
      event.preventDefault();
      if (next >= 0) current[next]?.focus();
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  const dialog = (
    <div
      className={cn(
        'fixed inset-0 flex items-end justify-center p-3 sm:items-center sm:p-6',
        'bg-slate-950/85 backdrop-blur-sm',
        zIndexClass,
        overlayClassName
      )}
    >
      <button
        type="button"
        className="absolute inset-0 z-0"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label ?? 'Dialog'}
        className={cn(
          'pointer-events-auto relative z-10 flex max-h-[min(92dvh,92vh)] w-full min-w-0 flex-col overflow-hidden',
          'rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl',
          PANEL_WIDTH[width],
          panelClassName
        )}
      >
        {children}
      </div>
    </div>
  );

  // Portaled so page chrome (z-40 nav) cannot cover the panel while it opens.
  if (typeof document === 'undefined') return null;
  return createPortal(dialog, document.body);
}

export function ModalHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <header className={cn('shrink-0 border-b border-slate-800 px-4 py-4 sm:px-6 sm:py-5', className)}>
      {children}
    </header>
  );
}

export function ModalBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5',
        className
      )}
    >
      {children}
    </div>
  );
}

export function ModalFooter({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <footer
      className={cn(
        'sticky bottom-0 z-10 shrink-0 border-t border-slate-800 bg-slate-900/95 px-4 py-3 backdrop-blur-sm sm:px-6',
        className
      )}
    >
      {children}
    </footer>
  );
}
