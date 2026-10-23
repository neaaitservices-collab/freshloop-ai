'use client';

import React from 'react';
import { RecipeFusionResult } from '@/lib/types';
import { Printer, X, Tag, Sparkles, CheckCircle2, QrCode } from 'lucide-react';

interface DeliLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipe: RecipeFusionResult | null;
}

export const DeliLabelModal: React.FC<DeliLabelModalProps> = ({
  isOpen,
  onClose,
  recipe
}) => {
  if (!isOpen || !recipe) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-md w-full p-4 sm:p-6 space-y-4 sm:space-y-6 shadow-2xl relative max-h-[92vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-full bg-zinc-800"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              <Printer className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Deli Label Printer</span>
          </div>
          <h2 className="text-lg font-black text-white">Grab-n-Go Price Tag Preview</h2>
          <p className="text-xs text-zinc-400">
            High-margin deli sticker for rescued kitchen prep items.
          </p>
        </div>

        {/* PHYSICAL DELI LABEL STICKER PREVIEW (Printable Container) */}
        <div className="bg-white text-zinc-950 p-5 rounded-2xl border-2 border-dashed border-zinc-400 shadow-xl space-y-3 font-sans printable-label">
          {/* Brand Header */}
          <div className="flex items-center justify-between border-b-2 border-zinc-950 pb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-600 fill-emerald-600" />
              <span className="font-black text-xs tracking-tight uppercase">FRESHLOOP KITCHEN RESCUE</span>
            </div>
            <span className="text-[10px] font-extrabold px-2 py-0.5 bg-zinc-950 text-white rounded">
              CHEF SPECIAL
            </span>
          </div>

          {/* Recipe Title & Category */}
          <div>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide block">
              {recipe.category} &bull; Prepared Fresh Daily
            </span>
            <h3 className="text-base font-extrabold text-zinc-950 leading-tight">
              {recipe.recipeName}
            </h3>
          </div>

          {/* Yield & Target Price Badge */}
          <div className="flex items-center justify-between bg-zinc-100 p-2.5 rounded-xl border border-zinc-300">
            <div>
              <span className="text-[10px] text-zinc-600 block">Portion Yield</span>
              <span className="text-xs font-bold text-zinc-900">{recipe.estimatedYield}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-zinc-600 block">Retail Price</span>
              <span className="text-xl font-black text-emerald-700">${recipe.targetRetailPrice.toFixed(2)}</span>
            </div>
          </div>

          {/* Rescued Waste Callout */}
          <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-[11px] text-emerald-900 font-semibold flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
            <span>Rescued Produce & Dairy &bull; {recipe.grossMarginPct}% Deli Margin</span>
          </div>

          {/* Ingredients & Allergens */}
          <div className="text-[10px] text-zinc-700 space-y-1">
            <p>
              <strong>Ingredients:</strong> {recipe.ingredientsUsed.map(i => i.name).join(', ')}
            </p>
            {recipe.allergens && recipe.allergens.length > 0 && (
              <p className="text-rose-700 font-bold">
                ⚠️ Contains Allergens: {recipe.allergens.join(', ')}
              </p>
            )}
          </div>

          {/* Simulated Barcode */}
          <div className="pt-2 border-t border-zinc-200 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[9px] text-zinc-500 block">PLU: 9402-FL-DELI</span>
              <span className="text-[9px] text-zinc-500 block">Packed: {new Date().toISOString().split('T')[0]}</span>
            </div>
            <div className="font-mono text-xs tracking-tighter font-extrabold bg-zinc-100 px-2 py-1 rounded">
              ||| | |||| | ||| | |||
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-400 hover:text-white"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 text-xs font-extrabold rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95"
          >
            <Printer className="w-4 h-4" /> Print Deli Sticker
          </button>
        </div>
      </div>
    </div>
  );
};
