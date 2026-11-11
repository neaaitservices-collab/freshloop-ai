'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, X } from 'lucide-react';
import {
  purchaseOrderMailto,
  purchaseOrderSendAllConfirm,
  purchaseOrderSendPlan,
  supplierRecipientHint,
  type PoDraft,
} from '@/components/features/orders/supplierMail';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils/cn';

type SendOutcome = 'sent' | 'failed' | 'blocked' | 'skipped' | 'mailto';

interface SendResult {
  supplier: string;
  outcome: SendOutcome;
  message: string;
  mailto?: string;
}

async function sendOneDraft(draft: PoDraft): Promise<SendResult> {
  if (!draft.to.trim()) {
    return { supplier: draft.supplier, outcome: 'skipped', message: 'No email, skipped.' };
  }
  try {
    const response = await fetch('/api/orders/purchase-order-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        supplierId: draft.supplierId ?? null,
        supplierName: draft.supplier,
        to: draft.to,
        subject: draft.subject,
        body: draft.body,
        productIds: draft.productIds,
      }),
    });
    const json = (await response.json().catch(() => null)) as {
      error?: string;
      code?: string;
    } | null;
    const message = json?.error || (response.ok ? 'Sent.' : 'Email could not be sent.');
    if (json?.code === 'EMAIL_NOT_CONFIGURED') {
      const mailto = purchaseOrderMailto(draft);
      return {
        supplier: draft.supplier,
        outcome: 'mailto',
        message,
        ...(mailto ? { mailto } : {}),
      };
    }
    if (response.status === 409) {
      return { supplier: draft.supplier, outcome: 'blocked', message };
    }
    if (!response.ok) return { supplier: draft.supplier, outcome: 'failed', message };
    return { supplier: draft.supplier, outcome: 'sent', message: 'Sent.' };
  } catch {
    return { supplier: draft.supplier, outcome: 'failed', message: 'Email could not be sent.' };
  }
}

export function PoEmailPanel({
  drafts,
  activeIndex,
  onActiveIndex,
  onChange,
  onClose,
  onPrepare,
  onOrderSent,
}: {
  drafts: PoDraft[];
  activeIndex: number;
  onActiveIndex: (index: number) => void;
  onChange: (next: PoDraft) => void;
  onClose: () => void;
  onPrepare: () => void;
  onOrderSent?: (productIds: string[]) => void;
}) {
  const [sending, setSending] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [results, setResults] = useState<SendResult[]>([]);
  const index =
    drafts.length === 0 ? 0 : Math.min(Math.max(activeIndex, 0), drafts.length - 1);
  const draft = drafts[index];
  if (!draft) return null;
  const hint = supplierRecipientHint(draft);
  const many = drafts.length > 1;
  const plan = purchaseOrderSendPlan(drafts);

  const deliver = async (list: PoDraft[]) => {
    const nextPlan = purchaseOrderSendPlan(list);
    setSending(true);
    setConfirmAll(false);
    try {
      const sentResults = await Promise.all(nextPlan.ready.map((item) => sendOneDraft(item)));
      const skippedResults: SendResult[] = nextPlan.skipped.map((item) => ({
        supplier: item.supplier,
        outcome: 'skipped',
        message: 'No email, skipped.',
      }));
      setResults([...skippedResults, ...sentResults]);
      const sentIds = nextPlan.ready
        .filter((_, resultIndex) => sentResults[resultIndex]?.outcome === 'sent')
        .flatMap((item) => item.productIds);
      if (sentIds.length > 0) onOrderSent?.(sentIds);
    } finally {
      setSending(false);
    }
  };

  return (
    <div id="po-email">
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
          <CardTitle className="flex min-w-0 items-center gap-2 text-sm">
            <Mail className="h-4 w-4 shrink-0 text-blue-300/90" />
            <span className="truncate">
              {many ? 'PO drafts' : 'PO draft'}
              <span className="font-normal text-slate-400"> · {draft.supplier}</span>
            </span>
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
          {many ? (
            <div
              role="tablist"
              aria-label="Purchase order drafts by supplier"
              className="flex flex-wrap gap-1.5"
            >
              {drafts.map((item, itemIndex) => {
                const selected = itemIndex === index;
                return (
                  <button
                    key={`${item.supplier}-${itemIndex}`}
                    type="button"
                    role="tab"
                    id={`po-draft-tab-${itemIndex}`}
                    aria-selected={selected}
                    aria-controls="po-draft-panel"
                    onClick={() => onActiveIndex(itemIndex)}
                    className={cn(
                      'min-h-11 max-w-full rounded-xl px-3 py-1.5 text-left text-xs font-bold',
                      selected
                        ? 'bg-blue-500/15 text-blue-100 ring-1 ring-blue-400/40'
                        : 'text-slate-400 hover:bg-slate-800/80'
                    )}
                  >
                    <span className="block truncate">{item.supplier}</span>
                    <span className="block truncate font-medium text-slate-400">
                      {item.to.trim() || 'No email'}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <div
            role={many ? 'tabpanel' : undefined}
            id="po-draft-panel"
            aria-labelledby={many ? `po-draft-tab-${index}` : undefined}
            className="space-y-3"
          >
            {many ? (
              <p className="text-xs text-slate-400">
                Draft {index + 1} of {drafts.length}. This draft includes only {draft.supplier}.
              </p>
            ) : null}
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Supplier
              <p className="mt-1 text-sm font-semibold normal-case tracking-normal text-slate-100">
                {draft.supplier}
              </p>
            </div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              To
              <Input
                value={draft.to}
                onChange={(event) => onChange({ ...draft, to: event.target.value })}
                placeholder="Supplier email"
                aria-describedby={hint ? 'po-draft-recipient-hint' : undefined}
                className="mt-1 text-sm font-semibold"
              />
            </label>
            {hint ? <SupplierHint message={hint} /> : null}
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
              disabled={draft.productIds.length === 0 || !draft.to.trim()}
              onClick={onPrepare}
            >
              <Mail className="h-4 w-4" />
              Prepare draft
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="primary"
                className="py-3"
                disabled={sending || draft.productIds.length === 0 || !draft.to.trim()}
                onClick={() => void deliver([draft])}
              >
                Send
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="py-3"
                disabled={sending || drafts.length === 0}
                onClick={() => {
                  if (plan.ready.length === 0) {
                    setResults(
                      plan.skipped.map((item) => ({
                        supplier: item.supplier,
                        outcome: 'skipped',
                        message: 'No email, skipped.',
                      }))
                    );
                    return;
                  }
                  setConfirmAll(true);
                }}
              >
                Send all
              </Button>
            </div>
            {confirmAll ? (
              <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                <p className="text-sm text-slate-100">{purchaseOrderSendAllConfirm(plan.ready.length)}</p>
                {plan.skipped.length > 0 ? (
                  <p className="text-xs text-slate-400">
                    No email, skipped: {plan.skipped.map((item) => item.supplier).join(', ')}
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    disabled={sending || plan.ready.length === 0}
                    onClick={() => void deliver(drafts)}
                  >
                    Send {plan.ready.length} {plan.ready.length === 1 ? 'email' : 'emails'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setConfirmAll(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
            {results.length > 0 ? (
              <ul aria-label="Purchase order email results" className="space-y-1 text-xs text-slate-300">
                {results.map((result, resultIndex) => (
                  <li key={`${result.supplier}-${result.outcome}-${resultIndex}`}>
                    <span>
                      {result.supplier}: {result.message}
                    </span>
                    {result.mailto ? (
                      <>
                        {' '}
                        <a
                          href={result.mailto}
                          className="font-semibold text-blue-300 underline underline-offset-2"
                        >
                          Open in mail
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function SupplierHint({ message }: { message: string }) {
  const label = 'Suppliers';
  const at = message.lastIndexOf(label);
  return (
    <p id="po-draft-recipient-hint" className="text-xs text-slate-400">
      {at === -1 ? (
        message
      ) : (
        <>
          {message.slice(0, at)}
          <Link
            href="/admin/suppliers"
            className="font-semibold text-blue-300 underline underline-offset-2"
          >
            {label}
          </Link>
          {message.slice(at + label.length)}
        </>
      )}
    </p>
  );
}
