import Link from 'next/link';
import {
  adminInvoiceDetailHref,
  adminInvoiceListHref,
  type AdminInvoiceListInput,
  type AdminInvoiceListItem,
  type AdminInvoiceNormalizedKey,
} from '@/lib/domains/receiving/adminInvoiceQuery';

const FIELD =
  'mt-1.5 w-full min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-emerald-500/50';

const FOCUS =
  'focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400';

export interface AdminInvoiceSupplierOption {
  id: string;
  name: string;
}

function invoiceWhen(item: AdminInvoiceListItem): string {
  return item.invoiceDate?.trim() || item.invoiceDateKey || 'No invoice date';
}

function lineCountLabel(count: number): string {
  return count === 1 ? '1 line' : `${count} lines`;
}

export function AdminInvoiceList({
  invoices,
  suppliers,
  filters,
  nextCursor,
  notice,
  error,
  normalized,
}: {
  invoices: AdminInvoiceListItem[];
  suppliers: AdminInvoiceSupplierOption[];
  filters: AdminInvoiceListInput;
  nextCursor: string | null;
  notice: string | null;
  error: string | null;
  normalized: AdminInvoiceNormalizedKey;
}) {
  const nextHref = nextCursor
    ? adminInvoiceListHref({ ...filters, cursor: nextCursor })
    : null;
  const filtered = Boolean(
    filters.invoiceNumber?.trim() ||
      filters.supplierId?.trim() ||
      filters.from?.trim() ||
      filters.to?.trim() ||
      filters.cursor?.trim()
  );

  return (
    <div className="space-y-4">
      <form method="get" action="/admin/invoices" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm font-semibold text-slate-200">
          Invoice number
          <input
            name="q"
            defaultValue={filters.invoiceNumber ?? ''}
            autoComplete="off"
            inputMode="text"
            className={FIELD}
            placeholder="1001 or 1001/A"
          />
        </label>
        <label className="block text-sm font-semibold text-slate-200">
          Supplier
          <select name="supplier" defaultValue={filters.supplierId ?? ''} className={FIELD}>
            <option value="">All suppliers</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-slate-200">
          From
          <input name="from" type="date" defaultValue={filters.from ?? ''} className={FIELD} />
        </label>
        <label className="block text-sm font-semibold text-slate-200">
          To
          <input name="to" type="date" defaultValue={filters.to ?? ''} className={FIELD} />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            className={`inline-flex min-h-11 items-center rounded-xl border border-slate-700 bg-slate-800 px-4 text-sm font-bold text-slate-100 ${FOCUS}`}
          >
            Search invoices
          </button>
          {filtered ? (
            <Link
              href="/admin/invoices"
              prefetch={false}
              className={`inline-flex min-h-11 items-center text-sm font-bold text-slate-300 ${FOCUS}`}
            >
              Clear search
            </Link>
          ) : null}
        </div>
      </form>

      {error ? (
        <p role="alert" className="text-sm font-semibold text-rose-200">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-sm text-amber-100">{notice}</p> : null}
      {normalized.invoiceKey ? (
        <p className="text-sm text-slate-400">
          Matched on invoice key <span className="font-semibold text-slate-200">{normalized.invoiceKey}</span>
          {normalized.invoiceKeyCompact && normalized.invoiceKeyCompact !== normalized.invoiceKey
            ? ` (compact ${normalized.invoiceKeyCompact})`
            : ''}
          .
        </p>
      ) : null}

      {invoices.length === 0 ? (
        <p className="text-sm text-slate-400">No invoices match this search.</p>
      ) : (
        <ul className="divide-y divide-slate-800 rounded-2xl border border-slate-800" role="list">
          {invoices.map((invoice) => (
            <li key={invoice.id} role="listitem">
              <Link
                href={adminInvoiceDetailHref(invoice.id, filters)}
                prefetch={false}
                className={`flex min-h-11 flex-col gap-1 px-4 py-3 hover:bg-slate-800/60 ${FOCUS}`}
              >
                <span className="text-base font-bold text-slate-50">{invoice.invoiceNumber}</span>
                <span className="text-sm text-slate-300">
                  {invoice.supplierName}
                  {' · '}
                  {invoiceWhen(invoice)}
                  {' · '}
                  {lineCountLabel(invoice.lineCount)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {nextHref ? (
        <Link
          href={nextHref}
          prefetch={false}
          className={`inline-flex min-h-11 items-center text-sm font-bold text-emerald-300 ${FOCUS}`}
        >
          Next invoices
        </Link>
      ) : null}
    </div>
  );
}
