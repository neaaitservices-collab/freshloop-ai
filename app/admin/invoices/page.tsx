import { AdminInvoiceList } from '@/components/features/admin/AdminInvoiceList';
import { AdminSectionHeader } from '@/components/features/admin/AdminSectionHeader';
import { PageIntro } from '@/components/layout/PageIntro';
import { PageMain } from '@/components/ui/layout';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import {
  readAdminInvoiceListInput,
  type AdminInvoiceNormalizedKey,
} from '@/lib/domains/receiving/adminInvoiceQuery';
import { listAdminInvoices } from '@/lib/domains/receiving/adminInvoiceRead';
import { listSuppliers } from '@/lib/domains/suppliers/suppliers';

export const dynamic = 'force-dynamic';

const EMPTY_KEY: AdminInvoiceNormalizedKey = { invoiceKey: null, invoiceKeyCompact: null };

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await guardFreshPage('/admin/invoices');
  const filters = readAdminInvoiceListInput(await searchParams);
  const listed = await listAdminInvoices(filters);
  const suppliers = await listSuppliers();

  return (
    <PageMain className="py-6 sm:py-8">
      <AdminSectionHeader titleTag="p" />
      <div className="mt-6">
        <PageIntro
          step="Admin · Suppliers"
          title="Invoices"
          description="Saved supplier invoices. Search uses the invoice key, then open one to see the lines that were received."
        />
      </div>
      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-6">
        <AdminInvoiceList
          invoices={listed.ok ? listed.invoices : []}
          suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
          filters={filters}
          nextCursor={listed.ok ? listed.nextCursor : null}
          notice={listed.ok ? listed.notice : null}
          error={listed.ok ? null : listed.error}
          normalized={listed.ok ? listed.normalized : EMPTY_KEY}
        />
      </div>
    </PageMain>
  );
}
