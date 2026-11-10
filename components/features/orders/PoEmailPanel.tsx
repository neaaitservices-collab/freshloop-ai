'use client';

import React from 'react';
import { Loader2, Mail, X } from 'lucide-react';
import type { PoDraft } from '@/components/features/orders/supplierMail';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

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
    <div id="po-email">
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Mail className="h-4 w-4 text-blue-300/90" />
          Send PO email
          <span className="font-normal text-slate-400">· {draft.supplier}</span>
        </CardTitle>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close purchase order email"
          className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardBody className="space-y-3 pt-0">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
          To
          <Input
            value={draft.to}
            onChange={(event) => onChange({ ...draft, to: event.target.value })}
            placeholder="Supplier email"
            className="mt-1 text-sm font-semibold"
          />
        </label>
        {!draft.to.trim() ? (
          <p className="text-xs text-slate-400">
            No supplier email is stored. Type the recipient. An address is not guessed from the name.
          </p>
        ) : null}
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Subject
          <Input
            value={draft.subject}
            onChange={(event) => onChange({ ...draft, subject: event.target.value })}
            className="mt-1 text-sm font-semibold"
          />
        </label>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Draft
          <textarea
            value={draft.body}
            rows={7}
            onChange={(event) => onChange({ ...draft, body: event.target.value })}
            className="mt-1 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs leading-relaxed text-slate-200 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-600"
          />
        </label>
        <Button
          variant="success"
          className="w-full py-3"
          disabled={sending || draft.productIds.length === 0 || !draft.to.trim()}
          onClick={onSend}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {sending ? 'Sending…' : 'Send PO email'}
        </Button>
      </CardBody>
    </Card>
    </div>
  );
}
