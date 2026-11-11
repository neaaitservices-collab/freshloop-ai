'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { BookOpen, ChefHat, Mic, MoreHorizontal, Plus } from 'lucide-react';
import { VOICE_UI_ENABLED } from '@/lib/features/voiceUiEnabled';
import type { ProductionBomSummary } from '@/components/features/production/ProductionBomKpiBadges';
import { ProductionMobileSectionNav } from '@/components/features/production/ProductionMobileSectionNav';
import type { ProductionMobileSection } from '@/components/features/production/ProductionMobileSectionNav';
import { Button } from '@/components/ui/Button';

export type ProductionDashboardHeaderProps = {
  bomSummary: ProductionBomSummary;
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

const actionClass = 'min-h-11 shrink-0 snap-start whitespace-nowrap px-3 text-xs sm:px-4';

const menuItemClass =
  'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-bold text-slate-100 hover:bg-slate-800 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400';

function ProductionMoreActions({
  showVoice,
  onVoiceNote,
  onScrollToCatalog,
}: {
  showVoice: boolean;
  onVoiceNote?: () => void;
  onScrollToCatalog: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0 sm:hidden">
      <Button
        type="button"
        variant="secondary"
        className="min-h-11 min-w-11 px-3 text-xs font-bold"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="More production actions"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
        More
      </Button>
      {open ? (
        <div
          id={menuId}
          role="group"
          aria-label="More production actions"
          className="absolute right-0 z-50 mt-1 w-52 rounded-xl border border-slate-700 bg-slate-950 p-1 shadow-2xl"
        >
          {showVoice ? (
            <button
              type="button"
              className={menuItemClass}
              onClick={() => {
                setOpen(false);
                onVoiceNote?.();
              }}
            >
              <Mic className="h-4 w-4 text-teal-400" aria-hidden />
              Voice note
            </button>
          ) : null}
          <button
            type="button"
            className={menuItemClass}
            onClick={() => {
              setOpen(false);
              onScrollToCatalog();
            }}
          >
            <BookOpen className="h-4 w-4" aria-hidden />
            Catalog
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ProductionDashboardHeader({
  bomSummary,
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
  const showVoice = Boolean(VOICE_UI_ENABLED && onVoiceNote);
  const parkSecondary = canEditBom || canExecuteBom;
  const changeSection = (section: ProductionMobileSection) => {
    onMobileSectionChange(section);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  };

  return (
    <>
      <header className="relative z-40 mb-3 rounded-2xl border border-slate-800/90 bg-slate-900/60 p-3 sm:p-5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-200">
              Production Operations
            </p>
            <h1 className="text-lg font-black tracking-tight text-white sm:text-2xl lg:text-3xl">
              Production Dashboard
            </h1>
          </div>
          <div className="flex min-w-0 items-start gap-2 lg:max-w-xl lg:justify-end">
            <div
              role="toolbar"
              aria-label="Production actions"
              className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
            >
            {canEditBom ? (
              <Button
                type="button"
                variant="secondary"
                className={`${actionClass} border-emerald-500/40 bg-slate-950 font-bold text-emerald-300`}
                onClick={onNewBom}
              >
                <Plus className="h-4 w-4 text-emerald-400" aria-hidden />
                New BOM
              </Button>
            ) : null}
            {canExecuteBom ? (
              <Button
                type="button"
                variant="secondary"
                className={`${actionClass} border-amber-500/40 bg-amber-400/90 font-black text-slate-950`}
                onClick={onExecuteBatch}
              >
                <ChefHat className="h-4 w-4" aria-hidden />
                Execute batch
              </Button>
            ) : null}
            {showVoice ? (
              <Button
                type="button"
                variant="secondary"
                className={`${actionClass} border-teal-500/40 bg-slate-950 font-bold text-teal-200 ${
                  parkSecondary ? 'hidden sm:inline-flex' : ''
                }`}
                onClick={onVoiceNote}
              >
                <Mic className="h-4 w-4 text-teal-400" aria-hidden />
                Voice note
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              className={`${actionClass} font-bold lg:hidden ${parkSecondary ? 'hidden sm:inline-flex' : ''}`}
              onClick={onScrollToCatalog}
            >
              <BookOpen className="h-4 w-4" aria-hidden />
              Catalog
            </Button>
            </div>
            {parkSecondary ? (
              <ProductionMoreActions
                showVoice={showVoice}
                onVoiceNote={onVoiceNote}
                onScrollToCatalog={onScrollToCatalog}
              />
            ) : null}
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
