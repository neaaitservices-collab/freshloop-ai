'use client';

import React, { useEffect, useState } from 'react';
import { BookOpen, ChefHat, Mic, Plus } from 'lucide-react';
import { VOICE_UI_ENABLED } from '@/lib/features/voiceUiEnabled';
import {
  ProductionBomKpiBadges,
  type ProductionBomSummary,
} from '@/components/features/production/ProductionBomKpiBadges';
import { ProductionMobileSectionNav } from '@/components/features/production/ProductionMobileSectionNav';
import type { ProductionMobileSection } from '@/components/features/production/ProductionMobileSectionNav';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';

export type ProductionDashboardHeaderProps = {
  bomSummary: ProductionBomSummary;
  statsReady?: boolean;
  mobileSection: ProductionMobileSection;
  onMobileSectionChange: (section: ProductionMobileSection) => void;
  canEditBom: boolean;
  canExecuteBom: boolean;
  onNewBom: () => void;
  onExecuteBatch: () => void;
  onScrollToCatalog: () => void;
  syncing?: boolean;
  wasteKpiRefreshError?: string | null;
  onVoiceNote?: () => void;
};

export function ProductionDashboardHeader({
  bomSummary,
  statsReady = true,
  mobileSection,
  onMobileSectionChange,
  canEditBom,
  canExecuteBom,
  onNewBom,
  onExecuteBatch,
  onScrollToCatalog,
  syncing = false,
  wasteKpiRefreshError = null,
  onVoiceNote,
}: ProductionDashboardHeaderProps) {
  const [heroCollapsed, setHeroCollapsed] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      if (window.matchMedia('(min-width: 1024px)').matches) {
        setHeroCollapsed(false);
        return;
      }
      setHeroCollapsed(window.scrollY > 24);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const changeSection = (section: ProductionMobileSection) => {
    onMobileSectionChange(section);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      setHeroCollapsed(false);
    }
  };

  return (
    <>
      <header
        className={cn(
          'relative overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/60 transition-[max-height,opacity,margin,padding] duration-200',
          heroCollapsed
            ? 'mb-0 max-h-0 border-transparent p-0 opacity-0 lg:mb-0 lg:max-h-none lg:border-slate-800/90 lg:p-5 lg:opacity-100'
            : 'mb-3 max-h-[40rem] p-4 opacity-100 lg:p-5'
        )}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1 space-y-2.5">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-200">
              Production Operations
            </p>
            <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl lg:text-3xl">
              Production Dashboard
            </h1>
            <ProductionBomKpiBadges summary={bomSummary} loading={!statsReady} />
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap xl:max-w-md xl:justify-end">
            {canEditBom ? (
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 border-emerald-500/40 bg-slate-950 text-xs font-bold text-emerald-300 sm:min-h-10"
                onClick={onNewBom}
              >
                <Plus className="h-4 w-4 text-emerald-400" />
                New BOM
              </Button>
            ) : null}
            {canExecuteBom ? (
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 border-amber-500/40 bg-amber-400/90 text-xs font-black text-slate-950 sm:min-h-10"
                onClick={onExecuteBatch}
              >
                <ChefHat className="h-4 w-4" />
                Execute batch
              </Button>
            ) : null}
            {VOICE_UI_ENABLED && onVoiceNote ? (
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 border-teal-500/40 bg-slate-950 text-xs font-bold text-teal-200 sm:min-h-10"
                onClick={onVoiceNote}
              >
                <Mic className="h-4 w-4 text-teal-400" />
                Voice note
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 text-xs font-bold sm:min-h-10 lg:hidden"
              onClick={onScrollToCatalog}
            >
              <BookOpen className="h-4 w-4" />
              Catalog
            </Button>
          </div>
        </div>
        {syncing ? (
          <p className="mt-2 text-xs text-slate-400">Syncing waste KPI…</p>
        ) : null}
        {wasteKpiRefreshError ? (
          <p className="mt-2 rounded-xl border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-200">
            {wasteKpiRefreshError}
          </p>
        ) : null}
      </header>

      <div className="sticky top-14 z-30 -mx-3 border-b border-slate-800/80 bg-[#0b0f19]/95 px-3 pb-2 pt-1 backdrop-blur-md sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <ProductionMobileSectionNav
          active={mobileSection}
          onChange={changeSection}
          belowParCount={bomSummary.belowPar}
        />
      </div>
    </>
  );
}
