import { PageIntro } from '@/components/layout/PageIntro';
import { AdminViewTabs } from '@/components/features/admin/AdminViewTabs';
import { DepartmentAdminTable } from '@/components/features/admin/DepartmentAdminTable';
import { PageMain } from '@/components/ui/layout';
import { guardFreshPage } from '@/lib/auth/pageGuard';
import { canEditDepartments } from '@/lib/auth/staffCapabilities';
import { DEPARTMENT_TABLE_UNAVAILABLE } from '@/lib/domains/catalog/departmentAdmin';
import { loadAdminDepartments } from '@/lib/domains/catalog/departmentAdminStore';

export const dynamic = 'force-dynamic';

export default async function AdminDepartmentsPage() {
  const user = await guardFreshPage('/admin/departments');
  const listed = await loadAdminDepartments();
  const canEdit = canEditDepartments(user.role);

  return (
    <PageMain className="py-6 sm:py-8">
      <AdminViewTabs />
      <div className="mt-6">
        <PageIntro
          step="Admin · Departments"
          title="Departments"
          description="Codes and names for the store department list. A code stays the same after it is created. Turn a department off to hide it, and turn it back on when you need it."
        />
      </div>
      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:p-6">
        {listed.ready ? (
          <DepartmentAdminTable initialDepartments={listed.departments} canEdit={canEdit} />
        ) : (
          <p className="text-sm text-slate-400">{DEPARTMENT_TABLE_UNAVAILABLE}</p>
        )}
      </div>
    </PageMain>
  );
}
