import { FreshSessionSync } from '@/components/auth/FreshSessionSync';
import { SalesImportForm } from '@/components/features/admin/SalesImportForm';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { requireManagerStaff } from '@/lib/auth/guardRoute';
import { loadCsvColumnMapping } from '@/lib/domains/inventory/csvSalesImport';
import { prisma } from '@/lib/domains/inventory/ledger';
import { callerStoreId } from '@/lib/domains/inventory/saleStoreScope';
import { PageIntro } from '@/components/layout/PageIntro';
import { PageMain } from '@/components/ui/layout';

export const dynamic = 'force-dynamic';

export default async function SalesImportPage() {
  const user = await guardFreshPage('/admin/sales-import');
  await requireManagerStaff();
  const storeId = await callerStoreId(prisma);
  const mapping = await loadCsvColumnMapping(storeId);
  return (
    <PageMain className="py-4 pb-24 sm:py-6">
      <FreshSessionSync user={user} />
      <PageIntro
        step="Admin"
        title="Sales CSV"
        description="Upload a weekly POS export, check matched and unknown lines, then post the sale dates through the ledger."
      />
      <div className="mt-6">
        <SalesImportForm initialMapping={mapping} />
      </div>
    </PageMain>
  );
}
