'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  ACTIVITY_FILTERS,
  ACTIVITY_FILTER_LABELS,
  ACTIVITY_TYPE_LABELS,
  CREDIT_REASON_LABELS,
  CREDIT_REASONS,
  canReceiveCredit,
  canVoidActivity,
  manualActivityTypesForRole,
  type ActivityFilter,
  type ActivityType,
  type CreditReason,
  type SupplierTimelineItem,
} from '@/lib/domains/suppliers/supplierActivityModel';
import type { RoleName } from '@/lib/utils/roles';
import { cn } from '@/lib/utils/cn';

const FIELD =
  'mt-1.5 w-full min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500/50';

const TORONTO_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Toronto',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

type OpenCredits = { total: number; count: number; label: string };

type PagePayload = {
  items: SupplierTimelineItem[];
  nextCursor: string | null;
  openCredits: OpenCredits;
};

type FormState = {
  type: ActivityType;
  amount: string;
  invoiceRef: string;
  reason: CreditReason;
  productId: string;
  qty: string;
  note: string;
};

function emptyForm(type: ActivityType): FormState {
  return {
    type,
    amount: '',
    invoiceRef: '',
    reason: 'SHORT',
    productId: '',
    qty: '',
    note: '',
  };
}

function formatToronto(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return TORONTO_TIME.format(date);
}

async function readActivityPage(supplierId: string, filter: ActivityFilter, cursor: string | null) {
  const params = new URLSearchParams({ filter });
  if (cursor) params.set('cursor', cursor);
  const response = await fetch(`/api/admin/suppliers/${supplierId}/activity?${params}`, {
    cache: 'no-store',
  });
  const json = (await response.json()) as {
    success?: boolean;
    error?: string;
    items?: SupplierTimelineItem[];
    nextCursor?: string | null;
    openCredits?: OpenCredits;
  };
  if (!response.ok || !json.success || !json.openCredits || !json.items) {
    throw new Error(json.error || 'Activity could not be loaded.');
  }
  return {
    items: json.items,
    nextCursor: json.nextCursor ?? null,
    openCredits: json.openCredits,
  } satisfies PagePayload;
}

export function SupplierActivityPanel({
  supplierId,
  role,
}: {
  supplierId: string;
  role: RoleName;
}) {
  const addable = manualActivityTypesForRole(role);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [items, setItems] = useState<SupplierTimelineItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [openCredits, setOpenCredits] = useState<OpenCredits | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(addable.includes('NOTE') ? 'NOTE' : addable[0] ?? 'NOTE'));
  const [saving, setSaving] = useState(false);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setItems([]);
    setNextCursor(null);
    void readActivityPage(supplierId, filter, null)
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setOpenCredits(page.openCredits);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Activity could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supplierId, filter]);

  const reload = async () => {
    setError(null);
    const page = await readActivityPage(supplierId, filter, null);
    setItems(page.items);
    setNextCursor(page.nextCursor);
    setOpenCredits(page.openCredits);
  };

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await readActivityPage(supplierId, filter, nextCursor);
      setItems((current) => {
        const seen = new Set(current.map((item) => `${item.kind}:${item.id}`));
        return [...current, ...page.items.filter((item) => !seen.has(`${item.kind}:${item.id}`))];
      });
      setNextCursor(page.nextCursor);
      setOpenCredits(page.openCredits);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Activity could not be loaded.');
    } finally {
      setLoadingMore(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = { type: form.type };
    if (form.type === 'NOTE') payload.note = form.note;
    if (form.type === 'CREDIT') {
      payload.amount = Number(form.amount);
      payload.invoiceRef = form.invoiceRef;
      payload.reason = form.reason;
      payload.note = form.note || null;
    }
    if (form.type === 'LATE_DELIVERY') {
      payload.invoiceRef = form.invoiceRef || null;
      payload.note = form.note || null;
    }
    if (form.type === 'SHORT_SHIP' || form.type === 'QUALITY_REJECT') {
      payload.productId = form.productId || null;
      payload.qty = form.qty.trim() ? Number(form.qty) : null;
      payload.invoiceRef = form.invoiceRef || null;
      payload.note = form.note || null;
    }
    try {
      const response = await fetch(`/api/admin/suppliers/${supplierId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !json.success) {
        setError(json.error || 'Activity could not be saved.');
        return;
      }
      setFormOpen(false);
      setForm(emptyForm(form.type));
      await reload();
    } catch {
      setError('Activity could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const markReceived = async (activityId: string) => {
    setPendingId(activityId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/suppliers/${supplierId}/activity/${activityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditStatus: 'RECEIVED' }),
      });
      const json = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !json.success) {
        setError(json.error || 'Credit could not be marked received.');
        return;
      }
      await reload();
    } catch {
      setError('Credit could not be marked received.');
    } finally {
      setPendingId(null);
    }
  };

  const voidRow = async (activityId: string) => {
    setPendingId(activityId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/suppliers/${supplierId}/activity/${activityId}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voidReason }),
      });
      const json = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !json.success) {
        setError(json.error || 'Activity could not be voided.');
        return;
      }
      setVoidingId(null);
      setVoidReason('');
      await reload();
    } catch {
      setError('Activity could not be voided.');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="mt-6 border-t border-slate-800 pt-4" aria-labelledby="supplier-activity-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="supplier-activity-heading" className="text-sm font-black uppercase tracking-wider text-slate-300">
            Activity
          </h3>
          <p className="mt-1 text-sm font-bold text-white" role="status">
            {openCredits?.label ?? 'Open credits …'}
          </p>
        </div>
        {addable.length > 0 ? (
          <Button
            type="button"
            variant="success"
            className="min-h-11 w-full sm:w-auto"
            onClick={() => {
              setFormOpen((open) => !open);
              setError(null);
            }}
          >
            Add
          </Button>
        ) : null}
      </div>

      <div role="group" aria-label="Activity filter" className="mt-3 flex flex-wrap gap-2">
        {ACTIVITY_FILTERS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={cn(
              'min-h-11 rounded-full px-3 text-sm font-bold',
              filter === id
                ? 'bg-emerald-400 text-slate-950'
                : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
            )}
          >
            {ACTIVITY_FILTER_LABELS[id]}
          </button>
        ))}
      </div>

      {formOpen ? (
        <form
          className="mt-3 space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            Type
            <select
              value={form.type}
              onChange={(event) => setForm(emptyForm(event.target.value as ActivityType))}
              className={FIELD}
            >
              {addable.map((type) => (
                <option key={type} value={type}>
                  {ACTIVITY_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          {form.type === 'CREDIT' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Amount
                <input
                  required
                  inputMode="decimal"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                  className={FIELD}
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Reason
                <select
                  value={form.reason}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, reason: event.target.value as CreditReason }))
                  }
                  className={FIELD}
                >
                  {CREDIT_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {CREDIT_REASON_LABELS[reason]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          {form.type === 'SHORT_SHIP' || form.type === 'QUALITY_REJECT' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Product id
                <input
                  value={form.productId}
                  onChange={(event) => setForm((current) => ({ ...current, productId: event.target.value }))}
                  className={FIELD}
                  autoComplete="off"
                />
                <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-slate-500">
                  Optional catalog product id.
                </span>
              </label>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Quantity
                <input
                  inputMode="decimal"
                  type="number"
                  min="0.01"
                  step="any"
                  value={form.qty}
                  onChange={(event) => setForm((current) => ({ ...current, qty: event.target.value }))}
                  className={FIELD}
                />
              </label>
            </div>
          ) : null}
          {form.type !== 'NOTE' ? (
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
              Invoice reference
              <input
                required={form.type === 'CREDIT'}
                value={form.invoiceRef}
                onChange={(event) => setForm((current) => ({ ...current, invoiceRef: event.target.value }))}
                className={FIELD}
                autoComplete="off"
              />
            </label>
          ) : null}
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
            Note
            <textarea
              required={form.type === 'NOTE'}
              value={form.note}
              onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
              rows={3}
              className={FIELD}
            />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" variant="success" className="min-h-11 flex-1" disabled={saving}>
              {saving ? 'Saving…' : 'Save activity'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 flex-1"
              onClick={() => setFormOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-amber-200" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-3 text-sm text-slate-500" role="status">
          Loading activity…
        </p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500" role="status">
          No activity yet.
        </p>
      ) : (
        <ul role="list" className="mt-3 space-y-2">
          {items.map((item) => {
            const showReceive =
              canReceiveCredit(role) &&
              !item.readOnly &&
              item.source !== 'AUTO' &&
              item.activityType === 'CREDIT' &&
              item.creditStatus === 'OPEN' &&
              !item.voidedAt;
            const showVoid = canVoidActivity(role) && !item.readOnly && !item.voidedAt;
            return (
              <li key={`${item.kind}:${item.id}`} className="rounded-xl border border-slate-800 px-3 py-3">
                <div className={item.voidedAt ? 'line-through decoration-slate-500' : undefined}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-bold text-white">{item.title}</p>
                    <time dateTime={item.createdAt} className="text-xs text-slate-400">
                      {formatToronto(item.createdAt)}
                    </time>
                  </div>
                  {item.detail ? <p className="mt-1 text-sm text-slate-300">{item.detail}</p> : null}
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {item.readOnly ? 'Read only' : item.source === 'AUTO' ? 'Automatic' : 'Manual'}
                  </p>
                </div>
                {item.voidedAt ? (
                  <p className="mt-2 text-xs font-semibold text-amber-200">
                    Voided{item.voidReason ? `: ${item.voidReason}` : ''}
                  </p>
                ) : null}
                {showReceive || showVoid ? (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {showReceive ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-11"
                        disabled={pendingId === item.id}
                        onClick={() => void markReceived(item.id)}
                      >
                        Mark received
                      </Button>
                    ) : null}
                    {showVoid ? (
                      <Button
                        type="button"
                        variant="danger"
                        className="min-h-11"
                        onClick={() => {
                          setVoidingId(item.id);
                          setVoidReason('');
                        }}
                      >
                        Void
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {voidingId === item.id ? (
                  <form
                    className="mt-2 space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void voidRow(item.id);
                    }}
                  >
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                      Void reason
                      <input
                        required
                        value={voidReason}
                        onChange={(event) => setVoidReason(event.target.value)}
                        className={FIELD}
                      />
                    </label>
                    <Button
                      type="submit"
                      variant="danger"
                      className="min-h-11 w-full sm:w-auto"
                      disabled={pendingId === item.id || !voidReason.trim()}
                    >
                      Void row
                    </Button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-3 min-h-11 w-full"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </section>
  );
}
