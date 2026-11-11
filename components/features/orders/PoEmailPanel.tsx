'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Mail, X } from 'lucide-react';
import {
  applyPurchaseOrderLog,
  purchaseOrderClickPlan,
  purchaseOrderCompose,
  purchaseOrderCopiedMessage,
  purchaseOrderGroupCompose,
  purchaseOrderGroupOpenState,
  purchaseOrderOpenIdentity,
  purchaseOrderRepeatGate,
  purchaseOrderRepeatWarning,
  purchaseOrderSendPlan,
  purchaseOrderSkippedNoEmail,
  singleSupplierEmail,
  supplierRecipientHint,
  type PoDraft,
  type PurchaseOrderLogResult,
} from '@/components/features/orders/supplierMail';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils/cn';

type OpenLogJson = { error?: string; openedAt?: string } | null;

type KnownOpen = { state: 'checking' | 'ready' | 'opened'; openedAt?: string };

type OpenCheck = {
  id: string;
  supplierId: string | null;
  supplier: string;
  to: string;
  subject: string;
  body: string;
  productIds: string[];
};

function openCheck(item: PoDraft): OpenCheck {
  return {
    id: purchaseOrderOpenIdentity(item),
    supplierId: item.supplierId ?? null,
    supplier: item.supplier,
    to: item.to,
    subject: item.subject,
    body: item.body,
    productIds: item.productIds,
  };
}

async function readOpenLog(response: Response): Promise<OpenLogJson> {
  try {
    return (await response.json()) as OpenLogJson;
  } catch {
    return null;
  }
}

export function PoEmailPanel({
  drafts,
  activeIndex,
  onActiveIndex,
  onChange,
  onClose,
}: {
  drafts: PoDraft[];
  activeIndex: number;
  onActiveIndex: (index: number) => void;
  onChange: (next: PoDraft) => void;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState<string[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [skipNote, setSkipNote] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [known, setKnown] = useState<Record<string, KnownOpen>>({});
  const requestId = useRef(0);
  const index =
    drafts.length === 0 ? 0 : Math.min(Math.max(activeIndex, 0), drafts.length - 1);
  const withLines = drafts.filter((item) => item.productIds.length > 0 || item.body.trim().length > 0);
  const loggable = purchaseOrderSendPlan(withLines).ready;
  const watchKey = JSON.stringify(loggable.map(openCheck));

  useEffect(() => {
    const items = JSON.parse(watchKey) as OpenCheck[];
    requestId.current += 1;
    if (items.length === 0) {
      setKnown({});
      return;
    }
    let cancelled = false;
    setKnown(Object.fromEntries(items.map((item) => [item.id, { state: 'checking' }])));
    for (const item of items) {
      fetch('/api/orders/purchase-order-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          supplierId: item.supplierId,
          supplierName: item.supplier,
          to: item.to,
          subject: item.subject,
          body: item.body,
          productIds: item.productIds,
          checkOnly: true,
        }),
      })
        .then(async (response) => {
          if (cancelled) return;
          const json = await readOpenLog(response);
          if (cancelled) return;
          const gate = purchaseOrderRepeatGate(response.status);
          if (gate === 'confirm') {
            setKnown((current) => ({ ...current, [item.id]: { state: 'opened', openedAt: json?.openedAt } }));
            return;
          }
          setKnown((current) => ({ ...current, [item.id]: { state: 'ready' } }));
          if (gate === 'issue') {
            const next = applyPurchaseOrderLog(
              { notes: [], issues: [] },
              {
                supplier: item.supplier,
                grouped: false,
                result: { status: response.status, error: json?.error, openedAt: json?.openedAt },
              }
            );
            if (next.issues.length > 0) setIssues((current) => [...current, ...next.issues]);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setKnown((current) => ({ ...current, [item.id]: { state: 'ready' } }));
          const next = applyPurchaseOrderLog(
            { notes: [], issues: [] },
            { supplier: item.supplier, grouped: false, result: { network: true } }
          );
          if (next.issues.length > 0) setIssues((current) => [...current, ...next.issues]);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [watchKey]);

  const draft = drafts[index];
  if (!draft) return null;
  const hint = supplierRecipientHint(draft);
  const many = drafts.length > 1;
  const activeCompose = purchaseOrderCompose(draft);
  const groupCompose = purchaseOrderGroupCompose(withLines);
  const sendHref = draft.productIds.length > 0 ? (activeCompose?.mailtoUrl ?? null) : null;
  const skippedNoEmail = withLines.filter((item) => !item.to.trim()).map((item) => item.supplier);
  const sendId = purchaseOrderOpenIdentity(draft);
  const sendState = !sendHref ? 'unavailable' : (known[sendId]?.state ?? 'checking');
  const groupStates = loggable.map((item) => known[purchaseOrderOpenIdentity(item)]?.state ?? 'checking');
  const groupState = groupCompose ? purchaseOrderGroupOpenState(groupStates) : 'unavailable';
  const sendWarning =
    sendState === 'opened' ? purchaseOrderRepeatWarning(known[sendId]?.openedAt ?? '') : null;
  const groupWarnings = loggable
    .filter((item) => known[purchaseOrderOpenIdentity(item)]?.state === 'opened')
    .map((item) => {
      const sentence = purchaseOrderRepeatWarning(known[purchaseOrderOpenIdentity(item)]?.openedAt ?? '');
      return loggable.length > 1 ? `${item.supplier}: ${sentence}` : sentence;
    });

  const showLog = (item: PoDraft, grouped: boolean, result: PurchaseOrderLogResult, generation: number) => {
    if (generation !== requestId.current) return;
    const next = applyPurchaseOrderLog(
      { notes: [], issues: [] },
      { supplier: item.supplier, grouped, result }
    );
    if (next.notes.length > 0) setNotes((current) => [...current, ...next.notes]);
    if (next.issues.length > 0) setIssues((current) => [...current, ...next.issues]);
  };

  const logOpened = (item: PoDraft, grouped: boolean, reopen: boolean) => {
    if (!singleSupplierEmail(item.to)) return;
    const generation = requestId.current;
    fetch('/api/orders/purchase-order-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        supplierId: item.supplierId ?? null,
        supplierName: item.supplier,
        to: item.to,
        subject: item.subject,
        body: item.body,
        productIds: item.productIds,
        ...(reopen ? { reopen: true } : {}),
      }),
    })
      .then(async (response) => {
        const json = await readOpenLog(response);
        showLog(item, grouped, { status: response.status, error: json?.error, openedAt: json?.openedAt }, generation);
      })
      .catch(() => {
        showLog(item, grouped, { network: true }, generation);
      });
  };

  const copyFullOrder = async (fullBody: string) => {
    try {
      await navigator.clipboard.writeText(fullBody);
      setCopyMessage(purchaseOrderCopiedMessage(true));
    } catch {
      setCopyMessage(purchaseOrderCopiedMessage(false));
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
            <div className="grid grid-cols-2 gap-2">
              <OrderLink
                href={sendHref}
                state={sendState}
                variant="primary"
                onOpen={(reopen) => logOpened(draft, false, reopen)}
              >
                Send
              </OrderLink>
              <OrderLink
                href={groupCompose?.mailtoUrl ?? null}
                state={groupState}
                variant="secondary"
                onOpen={(reopen) => {
                  setSkipNote(purchaseOrderSkippedNoEmail(skippedNoEmail));
                  for (const item of loggable) logOpened(item, true, reopen);
                }}
              >
                Send group
              </OrderLink>
            </div>
            {sendWarning ? <p className="text-sm text-amber-100">{sendWarning}</p> : null}
            {groupState === 'opened'
              ? groupWarnings.map((line) => (
                  <p key={line} className="text-sm text-amber-100">
                    {line}
                  </p>
                ))
              : null}
            {activeCompose?.truncated && sendHref ? (
              <button
                type="button"
                className="font-semibold text-blue-300 underline underline-offset-2"
                onClick={() => void copyFullOrder(draft.body)}
              >
                Copy full text
              </button>
            ) : null}
            {groupCompose?.truncated ? (
              <button
                type="button"
                className="font-semibold text-blue-300 underline underline-offset-2"
                onClick={() => void copyFullOrder(groupCompose.fullBody)}
              >
                Copy full text
              </button>
            ) : null}
            {skipNote ? <p className="text-sm text-slate-100">{skipNote}</p> : null}
            {copyMessage ? <p className="text-xs text-slate-300">{copyMessage}</p> : null}
            {notes.length > 0 ? (
              <ul aria-label="Opened orders" className="space-y-1 text-sm text-slate-100">
                {notes.map((note, noteIndex) => (
                  <li key={`${note}-${noteIndex}`}>{note}</li>
                ))}
              </ul>
            ) : null}
            {issues.length > 0 ? (
              <ul aria-label="Purchase order email results" className="space-y-1 text-xs text-slate-300">
                {issues.map((issue, issueIndex) => (
                  <li key={`${issue}-${issueIndex}`}>{issue}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function OrderLink({
  href,
  state,
  onOpen,
  children,
  variant,
}: {
  href: string | null;
  state: 'checking' | 'ready' | 'opened' | 'unavailable';
  onOpen: (reopen: boolean) => void;
  children: ReactNode;
  variant: 'primary' | 'secondary';
}) {
  const alreadyOpened = state === 'opened';
  const className = cn(
    'inline-flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 py-3 text-center text-sm font-bold focus-visible:outline-none focus-visible:ring-1 sm:min-h-[48px]',
    variant === 'primary'
      ? 'border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 focus-visible:ring-slate-600'
      : 'border border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800/80 focus-visible:ring-slate-600',
    (!href || state === 'checking' || state === 'unavailable') && 'cursor-not-allowed opacity-50'
  );
  if (!href || state === 'checking' || state === 'unavailable') {
    return (
      <span aria-disabled="true" className={className}>
        {children}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => {
        const plan = purchaseOrderClickPlan({ alreadyOpened, clicked: true });
        if (!plan.log) return;
        onOpen(plan.log.reopen);
      }}
    >
      {alreadyOpened ? 'Open again' : children}
    </a>
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
