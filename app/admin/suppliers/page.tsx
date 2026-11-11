import { PageIntro } from '@/components/layout/PageIntro';
import { AdminViewTabs } from '@/components/features/admin/AdminViewTabs';
import { SupplierDirectory } from '@/components/features/suppliers/SupplierTable';
import { PageMain } from '@/components/ui/layout';
import { listSuppliers } from '@/lib/domains/suppliers/suppliers';
import { requireOperationalStaff } from '@/lib/auth/guardRoute';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { requireSessionUser } from '@/lib/auth/session';
import { isManager } from '@/lib/utils/roles';

export const dynamic = 'force-dynamic';

export default async function AdminSuppliersPage() {
  await guardFreshPage('/admin/suppliers');
  await requireOperationalStaff();
  const actor = await requireSessionUser();
  const suppliers = await listSuppliers();
  const canEdit = isManager(actor.role);

  return (
    <PageMain className="py-6 sm:py-8">
      <AdminViewTabs />
      <div className="mt-6">
        <PageIntro
          step="Admin · Vendors"
          title="Supplier directory"
          description="Global vendor records used on receive, invoice OCR, and catalog supplier fields."
        />
      </div>
      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-6">
        <SupplierDirectory initialSuppliers={suppliers} canEdit={canEdit} actorRole={actor.role} />
      </div>
    </PageMain>
  );
}
