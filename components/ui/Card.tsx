'use client';

import React from 'react';
import { cn } from '@/lib/utils/cn';

export function Card({
  className,
  children,
  as: Tag = 'div',
}: {
  className?: string;
  children: React.ReactNode;
  as?: 'div' | 'section' | 'article';
}) {
  return (
    <Tag
      className={cn(
        'min-w-0 rounded-2xl border border-slate-800/80 bg-slate-900/50 shadow-lg shadow-black/20 backdrop-blur-md',
        className
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('border-b border-slate-800/80 px-4 py-3 sm:px-5', className)}>{children}</div>
  );
}

export function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <h3 className={cn('text-sm font-black tracking-tight text-slate-100', className)}>{children}</h3>
  );
}

export function CardDescription({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <p className={cn('mt-0.5 text-[11px] text-slate-400', className)}>{children}</p>;
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('px-4 py-4 sm:px-5 sm:py-5', className)}>{children}</div>;
}
