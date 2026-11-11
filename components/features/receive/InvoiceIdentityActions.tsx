'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import {
  actionsForIdentityHold,
  firstRenamePair,
  type IdentityHoldState,
  type InvoiceHoldAction,
} from '@/lib/domains/receiving/invoiceIdentityHold';

export function InvoiceIdentityActions({
  hold,
  dateDraft,
  onDateDraft,
  onConfirm,
}: {
  hold: IdentityHoldState;
  dateDraft?: string;
  onDateDraft?: (value: string) => void;
  onConfirm: (action: InvoiceHoldAction['action'], legacyKey?: string) => void;
}) {
  const actions = actionsForIdentityHold(hold);
  const pair = hold.code === 'RENAME_AMBIGUOUS' ? firstRenamePair(hold) : null;
  const legacy = hold.code === 'LEGACY_RECEIPT_PRESENT' ? (hold.legacyReceipts ?? []) : [];
  if (hold.code !== 'DATE_REQUIRED' && actions.length === 0 && legacy.length === 0 && !pair) return null;

  return (
    <div className="space-y-3">
      {hold.code === 'DATE_REQUIRED' && onDateDraft ? (
        <label className="block text-xs text-slate-300">
          Invoice date from the paper
          <input
            value={dateDraft ?? ''}
            onChange={(event) => onDateDraft(event.target.value)}
            placeholder="YYYY-MM-DD"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </label>
      ) : null}
      {pair ? (
        <p className="text-xs text-amber-100">
          Map &quot;{pair.mappedPrintedName}&quot; onto the saved line &quot;{pair.storedKey}&quot;.
        </p>
      ) : null}
      {actions.length > 0 || legacy.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((choice) => (
            <Button key={choice.action} type="button" variant="secondary" onClick={() => onConfirm(choice.action)}>
              {choice.label}
            </Button>
          ))}
          {legacy.map((receipt) => (
            <Button
              key={receipt.key}
              type="button"
              variant="secondary"
              onClick={() => onConfirm('adopt-legacy', receipt.key)}
            >
              Store manager: attach {receipt.vendor} / {receipt.invoice} without adding stock
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
