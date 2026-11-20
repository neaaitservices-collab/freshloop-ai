import Link from 'next/link';
import { PageIntro } from '@/components/layout/PageIntro';
import { AdminSectionHeader } from '@/components/features/admin/AdminSectionHeader';
import { SupplierDirectory } from '@/components/features/suppliers/SupplierTable';
import { PageMain } from '@/components/ui/layout';
import { listSuppliers } from '@/lib/domains/suppliers/suppliers';
import { requireOperationalStaff } from '@/lib/auth/guardRoute';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { requireSessionUser } from '@/lib/auth/session';
import { isManager } from '@/lib/utils/roles';

const invoicesLinkClass =
  'inline-flex min-h-11 items-center rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-bold text-slate-100 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400';

export const dynamic = 'force-dynamic';

export default async function AdminSuppliersPage() {
  await guardFreshPage('/admin/suppliers');
  await requireOperationalStaff();
  const actor = await requireSessionUser();
  const suppliers = await listSuppliers();
  const canEdit = isManager(actor.role);

  return (
    <PageMain className="py-6 sm:py-8">
      <AdminSectionHeader titleTag="p" />
      <div className="mt-6">
        <PageIntro
          step="Admin · Vendors"
          title="Supplier directory"
          description="Global vendor records used on receive, invoice OCR, and catalog supplier fields."
          action={
            <Link href="/admin/invoices" prefetch={false} className={invoicesLinkClass}>
              Invoices
            </Link>
          }
        />
      </div>
      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-6">
        <SupplierDirectory initialSuppliers={suppliers} canEdit={canEdit} actorRole={actor.role} />
      </div>
    </PageMain>
  );
}
