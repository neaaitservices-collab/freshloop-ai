import Link from 'next/link';
import {
  adminInvoiceListHref,
  type AdminInvoiceDetail as AdminInvoiceDetailModel,
  type AdminInvoiceListInput,
} from '@/lib/domains/receiving/adminInvoiceQuery';

const FOCUS =
  'focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function AdminInvoiceDetail({
  invoice,
  filters,
  error,
}: {
  invoice: AdminInvoiceDetailModel | null;
  filters: AdminInvoiceListInput;
  error: string | null;
}) {
  return (
    <div className="space-y-4">
      <Link
        href={adminInvoiceListHref(filters, false)}
        prefetch={false}
        className={`inline-flex min-h-11 items-center text-sm font-bold text-slate-300 ${FOCUS}`}
      >
        Back to invoices
      </Link>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-rose-200">
          {error}
        </p>
      ) : null}
      {!error && !invoice ? (
        <p className="text-sm text-slate-400">That invoice is not in the directory.</p>
      ) : null}
      {invoice ? (
        <article className="space-y-4">
          <header>
            <h1 className="text-2xl font-black tracking-tight text-white">{invoice.invoiceNumber}</h1>
            <p className="mt-1 text-sm text-slate-300">
              {invoice.supplierName}
              {' · '}
              {invoice.invoiceDate?.trim() || invoice.invoiceDateKey || 'No invoice date'}
              {' · '}
              Saved {formatWhen(invoice.createdAt)}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Invoice key <span className="font-semibold text-slate-200">{invoice.invoiceKey}</span>
            </p>
          </header>
          {invoice.lines.length === 0 ? (
            <p className="text-sm text-slate-400">This invoice has no printed lines.</p>
          ) : (
            <ul className="divide-y divide-slate-800 rounded-2xl border border-slate-800" role="list">
              {invoice.lines.map(({ line, delivery }) => (
                <li key={line.id} role="listitem" className="space-y-1 px-4 py-3">
                  <p className="text-base font-bold text-slate-50">{line.printedKey}</p>
                  <p className="text-sm text-slate-400">
                    Line {line.ordinal + 1}
                    {line.occurrence > 0 ? ` · repeat ${line.occurrence + 1}` : ''}
                    {line.heldByLegacy ? ' · older receipt' : ''}
                  </p>
                  {delivery ? (
                    <p className="text-sm text-slate-200">
                      Received {delivery.productName || delivery.itemName}
                      {' · '}
                      {delivery.casesReceived} cases
                      {' · '}
                      {delivery.unitsAdded} units
                      {' · '}
                      {money.format(delivery.caseCost)} / case
                      {' · '}
                      {formatWhen(delivery.createdAt.toISOString())}
                    </p>
                  ) : (
                    <p className="text-sm text-amber-100">Not received</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </article>
      ) : null}
    </div>
  );
}
