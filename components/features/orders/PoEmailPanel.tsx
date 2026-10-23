'use client';

import React from 'react';
import { Loader2, Mail, X } from 'lucide-react';
import type { PoDraft } from '@/components/features/orders/supplierMail';

const fieldClass =
  'mt-1 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-white outline-none transition focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-500/20';

export function PoEmailPanel({
  draft,
  sending,
  onChange,
  onClose,
  onSend,
}: {
  draft: PoDraft;
  sending: boolean;
  onChange: (next: PoDraft) => void;
  onClose: () => void;
  onSend: () => void;
}) {
  return (
    <section id="po-email" className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-4">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-black text-white">
          <Mail className="h-4 w-4 text-emerald-300" />
          Send PO Email
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close purchase order email"
          className="rounded-xl p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <label className="mt-3 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        To
        <input
          value={draft.to}
          onChange={(event) => onChange({ ...draft, to: event.target.value })}
          className={fieldClass}
        />
      </label>

      <label className="mt-3 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        Subject
        <input
          value={draft.subject}
          onChange={(event) => onChange({ ...draft, subject: event.target.value })}
          className={fieldClass}
        />
      </label>

      <label className="mt-3 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        Draft
        <textarea
          value={draft.body}
          rows={7}
          onChange={(event) => onChange({ ...draft, body: event.target.value })}
          className={`${fieldClass} resize-y font-mono text-[12px] font-normal leading-relaxed`}
        />
      </label>

      <button
        type="button"
        onClick={onSend}
        disabled={sending || draft.productIds.length === 0 || !draft.to.trim()}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        {sending ? 'Sending…' : 'Send PO Email'}
      </button>
    </section>
  );
}
