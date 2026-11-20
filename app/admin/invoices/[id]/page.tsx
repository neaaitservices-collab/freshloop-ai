import { notFound } from 'next/navigation';
import { AdminInvoiceDetail } from '@/components/features/admin/AdminInvoiceDetail';
import { AdminSectionHeader } from '@/components/features/admin/AdminSectionHeader';
import { PageMain } from '@/components/ui/layout';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { readAdminInvoiceListInput } from '@/lib/domains/receiving/adminInvoiceQuery';
import {
  getAdminInvoiceDetail,
  type AdminInvoiceDetailResult,
} from '@/lib/domains/receiving/adminInvoiceRead';

/** A saved id with no document is a 404. An invalid id stays an error on the page. */
export function openAdminInvoiceDetail(result: AdminInvoiceDetailResult): AdminInvoiceDetailResult {
  if (result.ok && !result.invoice) notFound();
  return result;
}

export const dynamic = 'force-dynamic';

export default async function AdminInvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await guardFreshPage('/admin/invoices');
  const [{ id }, filters] = await Promise.all([params, searchParams.then(readAdminInvoiceListInput)]);
  const result = openAdminInvoiceDetail(await getAdminInvoiceDetail(id));

  return (
    <PageMain className="py-6 sm:py-8">
      <AdminSectionHeader titleTag="p" />
      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-6">
        <AdminInvoiceDetail
          invoice={result.ok ? result.invoice : null}
          filters={filters}
          error={result.ok ? null : result.error}
        />
      </div>
    </PageMain>
  );
}
