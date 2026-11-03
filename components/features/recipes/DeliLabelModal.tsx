'use client';

import React, { useEffect } from 'react';
import { RecipeFusionResult } from '@/lib/types';
import { Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface DeliLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipe: RecipeFusionResult | null;
}

/**
 * Thermal-style deli tag preview. Only `.deli-label-print-surface` is visible when printing.
 */
export function DeliLabelModal({ isOpen, onClose, recipe }: DeliLabelModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !recipe) return null;

  const packedDate = new Date().toISOString().split('T')[0];
  const allergenLine =
    recipe.allergens && recipe.allergens.length > 0
      ? recipe.allergens.join(', ')
      : 'None declared';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="deli-label-modal-root fixed inset-0 z-50 flex items-end justify-center bg-black/85 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deli-label-title"
    >
      <div className="no-print absolute inset-0" onClick={onClose} aria-hidden />

      <div className="relative z-10 flex max-h-[94vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-slate-800 bg-slate-950 shadow-2xl sm:rounded-2xl">
        <div className="no-print flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Deli label
            </p>
            <h2 id="deli-label-title" className="text-sm font-extrabold text-slate-100">
              Thermal print preview
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-xl border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5">
          <div
            className="deli-label-print-surface mx-auto w-full max-w-[320px] rounded-sm border-2 border-black bg-white p-4 font-mono text-black shadow-none"
            data-print-label
          >
            <div className="border-b-2 border-black pb-2 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.2em]">FreshLoop Deli</p>
              <p className="text-[9px] font-bold uppercase">Production rescue · grab & go</p>
            </div>

            <h3 className="mt-3 text-base font-black uppercase leading-tight">{recipe.recipeName}</h3>
            <p className="mt-1 text-[10px] font-bold uppercase text-neutral-700">{recipe.category}</p>

            <div className="mt-4 flex items-end justify-between border-y-2 border-black py-2">
              <div>
                <p className="text-[9px] font-bold uppercase">Portion</p>
                <p className="text-[11px] font-bold leading-snug">{recipe.estimatedYield}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold uppercase">Price</p>
                <p className="text-3xl font-black leading-none">
                  ${recipe.targetRetailPrice.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-2 text-[10px] leading-snug">
              <p>
                <span className="font-black uppercase">Ingredients: </span>
                {recipe.ingredientsUsed.map((i) => i.name).join(', ')}
              </p>
              <p className="border border-black px-2 py-1 font-black uppercase">
                Contains: {allergenLine}
              </p>
              <p className="text-[9px]">
                Packed {packedDate} · Margin {recipe.grossMarginPct.toFixed(0)}% · PLU FL-DELI
              </p>
            </div>

            <div className="mt-3 border-t border-black pt-2 text-center text-[11px] font-black tracking-widest">
              ||| |||| | ||| |||| |
            </div>
          </div>
        </div>

        <div className="no-print flex gap-2 border-t border-slate-800 p-4">
          <Button type="button" variant="secondary" className="min-h-12 flex-1" onClick={onClose}>
            Close
          </Button>
          <Button type="button" variant="primary" className="min-h-12 flex-1" onClick={handlePrint}>
            <Printer className="h-4 w-4" />
            Print tag
          </Button>
        </div>
      </div>
    </div>
  );
}
