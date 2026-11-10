'use client';

import React from 'react';
import { CheckCircle2, Loader2, PackageX, Save, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export function ReceiptActionFooter({
  className,
  savedMessage,
  errorMessage,
  saving,
  dispositionBusy,
  alreadyInInventory,
  readOnly = false,
  saveDisabled,
  saveAllLabel,
  saveAllProgress,
  onSave,
  onSaveAll,
  onNotReceived,
  onRemoveFromList,
}: {
  className?: string;
  savedMessage: string | null;
  errorMessage: string | null;
  saving: boolean;
  dispositionBusy: boolean;
  alreadyInInventory: boolean;
  readOnly?: boolean;
  saveDisabled: boolean;
  saveAllLabel: string | null;
  saveAllProgress: string | null;
  onSave: () => void;
  onSaveAll?: () => void;
  onNotReceived: () => void;
  onRemoveFromList: () => void;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {savedMessage ? (
        <p className="flex items-center gap-2 px-1 text-xs font-bold text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {savedMessage}
        </p>
      ) : null}
      {errorMessage ? <p className="px-1 text-xs font-bold text-orange-300">{errorMessage}</p> : null}
      {readOnly ? (
        <p className="px-1 text-xs font-semibold text-slate-400">
          Already recorded. This receipt is not posted again.
        </p>
      ) : null}
      {!readOnly && !alreadyInInventory && !savedMessage ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onNotReceived}
            disabled={saving || dispositionBusy}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-amber-500/50 bg-amber-950/60 px-3 py-2.5 text-[11px] font-black text-amber-100 transition hover:bg-amber-900/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dispositionBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PackageX className="h-3.5 w-3.5 shrink-0" />
            )}
            Not received
          </button>
          <button
            type="button"
            onClick={onRemoveFromList}
            disabled={saving || dispositionBusy}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-[11px] font-black text-slate-300 transition hover:border-rose-500/40 hover:text-rose-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
            Remove
          </button>
        </div>
      ) : null}
      {readOnly ? null : (
        <>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || alreadyInInventory || dispositionBusy || saveDisabled}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {saving && !saveAllProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {alreadyInInventory ? 'In inventory' : 'Save this item'}
          </button>
          {onSaveAll && saveAllLabel ? (
            <button
              type="button"
              onClick={onSaveAll}
              disabled={saving || dispositionBusy}
              title="Other lines use saved pack defaults or 40% target; the selected line keeps the prices on screen."
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm font-black text-emerald-200 transition hover:bg-emerald-400/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saveAllProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saveAllProgress ? `Saving ${saveAllProgress}` : saveAllLabel}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
