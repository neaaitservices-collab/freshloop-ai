'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, X } from 'lucide-react';
import {
  openPurchaseOrderWindow,
  purchaseOrderCompose,
  purchaseOrderOpenedWarning,
  purchaseOrderSendAllConfirm,
  purchaseOrderSendPlan,
  purchaseOrderSkipMessage,
  settlePurchaseOrderWindow,
  supplierRecipientHint,
  type PoDraft,
  type PurchaseOrderPopup,
} from '@/components/features/orders/supplierMail';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils/cn';

type OpenOutcome = 'opened' | 'failed' | 'skipped';

interface OpenResult {
  supplier: string;
  outcome: OpenOutcome;
  message: string;
  truncated?: boolean;
  fullBody?: string;
  gmailUrl?: string;
  mailtoUrl?: string;
}

async function recordOpen(draft: PoDraft, reopen: boolean): Promise<
  | { ok: true }
  | { ok: false; status: number; openedAt?: string; message: string }
> {
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
      reopen,
    }),
  });
  const json = (await response.json().catch(() => null)) as { error?: string; openedAt?: string } | null;
  if (response.status === 409) {
    return { ok: false, status: 409, openedAt: json?.openedAt, message: json?.error || 'Already opened for this order.' };
  }
  if (!response.ok) {
    return { ok: false, status: response.status, message: json?.error || 'The order could not be recorded.' };
  }
  return { ok: true };
}

export function PoEmailPanel({
  drafts,
  activeIndex,
  onActiveIndex,
  onChange,
  onClose,
  onPrepare,
}: {
  drafts: PoDraft[];
  activeIndex: number;
  onActiveIndex: (index: number) => void;
  onChange: (next: PoDraft) => void;
  onClose: () => void;
  onPrepare: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [showOpens, setShowOpens] = useState(false);
  const [reopen, setReopen] = useState<{ draft: PoDraft; openedAt: string } | null>(null);
  const [results, setResults] = useState<OpenResult[]>([]);
  const index =
    drafts.length === 0 ? 0 : Math.min(Math.max(activeIndex, 0), drafts.length - 1);
  const draft = drafts[index];
  if (!draft) return null;
  const hint = supplierRecipientHint(draft);
  const many = drafts.length > 1;
  const plan = purchaseOrderSendPlan(drafts);
  const activeCompose = purchaseOrderCompose(draft);

  const openCompose = (item: PoDraft, again = false) => {
    const compose = purchaseOrderCompose(item);
    if (!compose) {
      setResults([{ supplier: item.supplier, outcome: 'skipped', message: purchaseOrderSkipMessage(item.to) }]);
      return;
    }
    const popup = openPurchaseOrderWindow((url, target) => window.open(url, target));
    if (!popup) {
      setResults([
        {
          supplier: item.supplier,
          outcome: 'failed',
          message: 'The compose window was blocked. Open it from the link.',
          gmailUrl: compose.gmailUrl,
          mailtoUrl: compose.mailtoUrl,
          fullBody: item.body,
        },
      ]);
      return;
    }
    void finishOpen(item, again, compose, popup);
  };

  const finishOpen = async (
    item: PoDraft,
    again: boolean,
    compose: NonNullable<ReturnType<typeof purchaseOrderCompose>>,
    popup: PurchaseOrderPopup
  ) => {
    setBusy(true);
    try {
      const settled = await settlePurchaseOrderWindow(popup, compose.gmailUrl, () => recordOpen(item, again));
      if (settled.outcome === 'repeat') {
        setReopen({ draft: item, openedAt: settled.openedAt });
        return;
      }
      if (settled.outcome === 'failed') {
        setResults([{ supplier: item.supplier, outcome: 'failed', message: settled.message }]);
        return;
      }
      setReopen(null);
      setResults([
        {
          supplier: item.supplier,
          outcome: 'opened',
          message: compose.truncated
            ? 'Compose opened. The order text was shortened to fit.'
            : 'Compose opened.',
          truncated: compose.truncated,
          fullBody: item.body,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const copyFullOrder = async (fullBody: string) => {
    try {
      await navigator.clipboard.writeText(fullBody);
      setResults((current) =>
        current.map((item) =>
          item.truncated ? { ...item, message: 'Compose opened. Full order copied.' } : item
        )
      );
    } catch {
      setResults((current) =>
        current.map((item) =>
          item.truncated ? { ...item, message: 'Compose opened. The full order could not be copied.' } : item
        )
      );
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
                disabled={busy || draft.productIds.length === 0 || !activeCompose}
                onClick={() => void openCompose(draft)}
              >
                Send
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="py-3"
                disabled={busy || drafts.length === 0}
                onClick={() => {
                  if (plan.ready.length === 0) {
                    setShowOpens(false);
                    setResults(
                      plan.skipped.map((item) => ({
                        supplier: item.supplier,
                        outcome: 'skipped',
                        message: purchaseOrderSkipMessage(item.to),
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
            {activeCompose ? (
              <a
                href={activeCompose.mailtoUrl}
                className="inline-block text-xs font-semibold text-blue-300 underline underline-offset-2"
              >
                Email app
              </a>
            ) : null}
            {confirmAll ? (
              <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                <p className="text-sm text-slate-100">{purchaseOrderSendAllConfirm(plan.ready.length)}</p>
                {plan.skipped.length > 0 ? (
                  <p className="text-xs text-slate-400">
                    Skipped, no valid email: {plan.skipped.map((item) => item.supplier).join(', ')}
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    disabled={plan.ready.length === 0}
                    onClick={() => {
                      setConfirmAll(false);
                      setShowOpens(true);
                    }}
                  >
                    Open one at a time
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setConfirmAll(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
            {showOpens ? (
              <ul aria-label="Open each supplier in Gmail" className="space-y-2">
                {plan.ready.map((item) => {
                  const compose = purchaseOrderCompose(item);
                  return (
                    <li key={`${item.supplier}-${item.to}`} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-200">{item.supplier}</span>
                      <Button type="button" variant="primary" disabled={busy} onClick={() => void openCompose(item)}>
                        Open in Gmail
                      </Button>
                      {compose ? (
                        <a
                          href={compose.mailtoUrl}
                          className="text-xs font-semibold text-blue-300 underline underline-offset-2"
                        >
                          Email app
                        </a>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {reopen ? (
              <div className="space-y-2 rounded-xl border border-amber-800/60 bg-amber-950/30 p-3">
                <p className="text-sm text-amber-100">{purchaseOrderOpenedWarning(reopen.openedAt)}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="primary" disabled={busy} onClick={() => void openCompose(reopen.draft, true)}>
                    Open again
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setReopen(null)}>
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
                    {result.gmailUrl ? (
                      <a
                        href={result.gmailUrl}
                        target="_blank"
                        rel="noopener"
                        className="ml-2 font-semibold text-blue-300 underline underline-offset-2"
                      >
                        Open in Gmail
                      </a>
                    ) : null}
                    {result.mailtoUrl ? (
                      <a href={result.mailtoUrl} className="ml-2 font-semibold text-blue-300 underline underline-offset-2">
                        Email app
                      </a>
                    ) : null}
                    {result.fullBody && (result.truncated || result.mailtoUrl) ? (
                      <button
                        type="button"
                        className="ml-2 font-semibold text-blue-300 underline underline-offset-2"
                        onClick={() => void copyFullOrder(result.fullBody ?? '')}
                      >
                        Copy full order
                      </button>
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
