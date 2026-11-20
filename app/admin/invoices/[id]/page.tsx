import { AdminInvoiceDetail } from '@/components/features/admin/AdminInvoiceDetail';
import { AdminSectionHeader } from '@/components/features/admin/AdminSectionHeader';
import { PageMain } from '@/components/ui/layout';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { readAdminInvoiceListInput } from '@/lib/domains/receiving/adminInvoiceQuery';
import { getAdminInvoiceDetail } from '@/lib/domains/receiving/adminInvoiceRead';

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
  const result = await getAdminInvoiceDetail(id);

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
