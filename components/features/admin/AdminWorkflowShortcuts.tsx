'use client';

import React from 'react';
import Link from 'next/link';
import { Activity, ChefHat, Package, Settings } from 'lucide-react';

const SHORTCUTS = [
  { href: '/receive', label: 'Receive', icon: Package },
  { href: '/production', label: 'Production', icon: ChefHat },
  { href: '/operations', label: 'Full ledger', icon: Activity },
  { href: '/admin/settings', label: 'Store settings', icon: Settings },
] as const;

export function AdminWorkflowShortcuts() {
  return (
    <div className="mt-5 border-t border-slate-800/80 pt-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        Workflow shortcuts
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SHORTCUTS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-3 text-xs font-bold text-slate-200 transition hover:border-emerald-500/35 hover:bg-emerald-950/20 hover:text-emerald-100"
            >
              <Icon className="h-4 w-4 shrink-0 text-emerald-400/90" aria-hidden />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
