'use client';

import React from 'react';
import { ChefHat, LayoutGrid, Scale } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type ProductionMobileSection = 'bom' | 'scrap' | 'floor';

export function ProductionMobileSectionNav({
  active,
  onChange,
  belowParCount,
}: {
  active: ProductionMobileSection;
  onChange: (section: ProductionMobileSection) => void;
  belowParCount: number;
}) {
  const tabs: {
    id: ProductionMobileSection;
    label: string;
    icon: React.ReactNode;
    alert?: boolean;
  }[] = [
    {
      id: 'bom',
      label: 'Recipes & BOM',
      icon: <ChefHat className="h-4 w-4 shrink-0" aria-hidden />,
      alert: belowParCount > 0,
    },
    {
      id: 'scrap',
      label: 'Scrap',
      icon: <Scale className="h-4 w-4 shrink-0" aria-hidden />,
    },
    {
      id: 'floor',
      label: 'Floor & prep',
      icon: <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />,
    },
  ];

  return (
    <nav
      className="grid grid-cols-3 gap-1 rounded-2xl border border-slate-800/90 bg-slate-900/90 p-1 shadow-lg backdrop-blur-md lg:hidden"
      aria-label="Production sections"
    >
      {tabs.map((tab) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-bold leading-tight transition-colors',
              selected
                ? 'bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-500/35'
                : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
            )}
            aria-current={selected ? 'page' : undefined}
          >
            {tab.icon}
            <span className="max-w-full truncate px-0.5">{tab.label}</span>
            {tab.alert ? (
              <span
                className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-slate-900"
                aria-label={`${belowParCount} below par`}
              />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
