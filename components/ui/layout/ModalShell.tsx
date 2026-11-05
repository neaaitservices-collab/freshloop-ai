'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

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
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  zIndexClass?: string;
  width?: keyof typeof PANEL_WIDTH;
  panelClassName?: string;
  overlayClassName?: string;
}) {
  if (!open) return null;

  return (
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
        className="absolute inset-0"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 flex max-h-[min(92vh,100dvh)] w-full min-w-0 flex-col overflow-hidden',
          'rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl',
          PANEL_WIDTH[width],
          panelClassName
        )}
      >
        {children}
      </div>
    </div>
  );
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
    <footer className={cn('shrink-0 border-t border-slate-800 px-4 py-3 sm:px-6', className)}>
      {children}
    </footer>
  );
}
