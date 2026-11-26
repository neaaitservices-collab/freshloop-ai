'use client';

import type { PurchaseOrderHistoryEntry } from '@/lib/domains/orders/purchaseOrderSubmit';

function statusLabel(status: string): string {
  if (status === 'APPROVED') return 'Approved';
  if (status === 'SENT') return 'Sent';
  if (status === 'OPENED') return 'Opened';
  if (status === 'FAILED') return 'Failed';
  if (status === 'PENDING') return 'Pending';
  return status;
}

function whenLabel(value: string): string {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return value;
  return time.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function PurchaseOrderHistory({
  orders,
  loading,
}: {
  orders: readonly PurchaseOrderHistoryEntry[];
  loading: boolean;
}) {
  return (
    <section aria-label="Purchase order history" className="border-t border-slate-800/80 px-3 py-3 sm:px-4">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">PO history</h3>
      {loading ? (
        <div className="mt-2 space-y-2" aria-hidden="true">
          <span className="block h-12 animate-pulse rounded-xl bg-slate-800/80" />
          <span className="block h-12 animate-pulse rounded-xl bg-slate-800/80" />
        </div>
      ) : orders.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">No purchase orders for this supplier yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex flex-col gap-1 rounded-xl border border-slate-800/80 bg-slate-950/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-100">
                  {statusLabel(order.status)}
                  <span className="font-normal text-slate-400"> · {order.toEmail}</span>
                </p>
                <p className="truncate text-xs text-slate-500">
                  {order.productIds.length} {order.productIds.length === 1 ? 'line' : 'lines'}
                  {order.subject ? ` · ${order.subject}` : ''}
                </p>
              </div>
              <p className="shrink-0 text-xs text-slate-400">{whenLabel(order.updatedAt || order.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
