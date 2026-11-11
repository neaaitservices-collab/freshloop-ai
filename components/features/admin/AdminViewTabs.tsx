'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

const TABS = [
  { href: '/admin/executive', label: 'Executive ROI' },
  { href: '/admin', label: 'Operations' },
  { href: '/admin/suppliers', label: 'Suppliers' },
  { href: '/admin/departments', label: 'Departments' },
] as const;

export type AdminViewHref = (typeof TABS)[number]['href'];

export function isAdminViewTabActive(pathname: string, href: AdminViewHref): boolean {
  if (href === '/admin/executive') return pathname.startsWith('/admin/executive');
  if (href === '/admin/suppliers') return pathname.startsWith('/admin/suppliers');
  if (href === '/admin/departments') return pathname.startsWith('/admin/departments');
  return pathname === '/admin';
}

export function selectedAdminViewHref(pathname: string): AdminViewHref | '' {
  return TABS.find((tab) => isAdminViewTabActive(pathname, tab.href))?.href ?? '';
}

/** Client route change for the mobile admin-view select. Unknown values are ignored. */
export function pushAdminView(push: (href: string) => void, href: string): void {
  const match = TABS.find((tab) => tab.href === href);
  if (match) push(match.href);
}

const focusRing =
  'focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400';

export function AdminViewTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const selected = selectedAdminViewHref(pathname);

  return (
    <>
      <select
        aria-label="Admin view"
        className={cn(
          'min-h-11 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 text-base sm:text-xs font-black text-slate-100 sm:hidden',
          focusRing
        )}
        value={selected}
        onChange={(event) => {
          pushAdminView((href) => router.push(href), event.target.value);
        }}
      >
        {selected === '' ? (
          <option value="" disabled>
            Admin view
          </option>
        ) : null}
        {TABS.map((tab) => (
          <option key={tab.href} value={tab.href}>
            {tab.label}
          </option>
        ))}
      </select>
      <nav
        className="hidden overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80 p-1 sm:flex"
        aria-label="Admin views"
      >
        {TABS.map((tab) => {
          const active = isAdminViewTabActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-lg px-3 py-2 text-xs font-black transition',
                focusRing,
                active ? 'bg-emerald-400 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
